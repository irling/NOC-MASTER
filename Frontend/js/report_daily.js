const REGION_CODE = '{{ region_code }}';
const REGION_NAME = '{{ nombre_region }}';
const SLA_BASE = { 'TX': 0.8667, 'AX': 175.2 };
let FUENTE_ACTUAL = 'TSC';
let _chartTop10 = null, _chartIndispo = null;
let _vistaIndispo = 'pct';
let _datosTop10 = null, _datosAlertas = null, _datosTabla = null, _datosAcum = null;

/* Reloj */
function tick() {
    const d = new Date();
    document.getElementById('clock').textContent =
        String(d.getHours()).padStart(2, '0') + ':' +
        String(d.getMinutes()).padStart(2, '0') + ':' +
        String(d.getSeconds()).padStart(2, '0');
}
setInterval(tick, 1000); tick();

/* Helper: nombre limpio del nodo */
function nombreNodo(codigo) {
    if (!codigo) return '';
    const p = String(codigo).split(' - ');
    return p[p.length - 1].trim();
}

/* ═════ Helpers de fecha ═════ */
function fmtFecha(d) {
    return d.toISOString().slice(0, 10);
}
function pad2(n) { return String(n).padStart(2, '0'); }

/* Última semana NOC completa: viernes pasado 12:00 → jueves siguiente 23:59 */
function rangoUltimaSemanaNOC() {
    const hoy = new Date();
    const dow = hoy.getDay(); // 0=dom, 5=vie
    // Buscar el viernes más reciente (puede ser hoy o anterior)
    // Si hoy es viernes y son < 12pm: usar viernes anterior
    let diasAtras;
    if (dow === 5) {
        diasAtras = hoy.getHours() < 12 ? 7 : 0;
    } else if (dow > 5) {
        diasAtras = dow - 5; // sábado=1, no aplica más
    } else {
        diasAtras = dow + 2; // dom=2, lun=3, mar=4, mié=5, jue=6
    }
    // Restar 7 más para obtener viernes de "última semana COMPLETA"
    diasAtras += 7;
    const viernesPasado = new Date(hoy);
    viernesPasado.setDate(hoy.getDate() - diasAtras);
    viernesPasado.setHours(12, 0, 0, 0);
    // Jueves de cierre = viernes + 6 días, 23:59:59
    const juevesCierre = new Date(viernesPasado);
    juevesCierre.setDate(viernesPasado.getDate() + 6);
    juevesCierre.setHours(23, 59, 59, 0);
    return { desde: fmtFecha(viernesPasado), hasta: fmtFecha(juevesCierre) };
}

/* Poblar selector Año-Mes desde ago-2025 hasta mes actual */
function poblarSelectorAnioMes() {
    const sel = document.getElementById('selAnioMes');
    if (!sel) return;
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const hoy = new Date();
    const opciones = ['<option value="SEMANA">Última semana OiM</option>'];
    // Recorrer desde 2025-08 hasta mes actual
    let y = 2025, m = 8;
    while (y < hoy.getFullYear() || (y === hoy.getFullYear() && m <= hoy.getMonth() + 1)) {
        opciones.push(`<option value="${y}-${pad2(m)}">${y} - ${meses[m - 1]}</option>`);
        m++;
        if (m > 12) { m = 1; y++; }
    }
    opciones.push('<option value="TODOS">📋 Todos los registros</option>');
    sel.innerHTML = opciones.join('');
    sel.value = 'SEMANA';
}

/* Aplicar cambio de Año-Mes a inputs Desde/Hasta */
function cambiarAnioMes() {
    const v = document.getElementById('selAnioMes').value;
    if (v === 'SEMANA') {
        const r = rangoUltimaSemanaNOC();
        document.getElementById('fDesde').value = r.desde;
        document.getElementById('fHasta').value = r.hasta;
    } else if (v === 'TODOS') {
        document.getElementById('fDesde').value = '2025-08-01';
        document.getElementById('fHasta').value = fmtFecha(new Date());
    } else if (v && v.match(/^\d{4}-\d{2}$/)) {
        const [yy, mm] = v.split('-').map(Number);
        const ini = new Date(yy, mm - 1, 1);
        const fin = new Date(yy, mm, 0); // último día del mes
        document.getElementById('fDesde').value = fmtFecha(ini);
        document.getElementById('fHasta').value = fmtFecha(fin);
    }
}

/* Inicializar filtros al arrancar */
(function initFiltros() {
    poblarSelectorAnioMes();
    cambiarAnioMes(); // arranca con "Última semana NOC"
})();

/* ═════ Contador de Deadline ═════ */
function actualizarDeadline() {
    const box = document.getElementById('deadlineBox');
    if (!box) return;
    const count = document.getElementById('deadlineCount');
    const meta = document.getElementById('deadlineMeta');

    // Calcular próximo viernes 12:00
    const ahora = new Date();
    const dow = ahora.getDay();
    let diasHasta;
    if (dow < 5) diasHasta = 5 - dow;
    else if (dow === 5) diasHasta = ahora.getHours() < 12 ? 0 : 7;
    else diasHasta = 5 - dow + 7; // sábado=6
    const proxViernes = new Date(ahora);
    proxViernes.setDate(ahora.getDate() + diasHasta);
    proxViernes.setHours(12, 0, 0, 0);

    let diff = proxViernes - ahora;
    if (diff < 0) { box.style.display = 'none'; return; }
    box.style.display = 'block';

    const dias = Math.floor(diff / 86400000);
    const hrs = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);

    // Énfasis visual progresivo
    box.classList.remove('urgent', 'critical');
    if (diff < 86400000) box.classList.add('critical');      // < 24h
    else if (diff < 2 * 86400000) box.classList.add('urgent');         // < 48h

    if (dias > 0) {
        count.textContent = `${dias}d ${pad2(hrs)}h ${pad2(mins)}m`;
    } else {
        count.textContent = `${pad2(hrs)}:${pad2(mins)}:${pad2(secs)}`;
    }

    if (diff < 86400000) {
        meta.innerHTML = '⚠️ <strong>HOY VENCE</strong> · viernes 12:00';
    } else if (diff < 2 * 86400000) {
        meta.textContent = '⏰ Mañana vence · viernes 12:00';
    } else {
        meta.textContent = `Hasta el viernes 12:00 PM`;
    }
}
setInterval(actualizarDeadline, 1000);
actualizarDeadline();

/* Loader */
const tipsLoader = [
    'Conectando a Google Drive…', 'Leyendo Hoja 1 de gestión…',
    'Cruzando con base Nokia…', 'Calculando atribuibilidad TSC…',
    'Procesando filtros OiM Nexus…', 'Generando gráficas…',
    'Detectando alertas críticas…', 'Casi listo…',
];
let _loaderInterval = null;
function arrancarLoader() {
    const ov = document.getElementById('loader-overlay');
    ov.classList.remove('hidden');
    let p = 0, tip = 0;
    document.getElementById('loaderText').textContent = tipsLoader[0];
    _loaderInterval = setInterval(() => {
        p = Math.min(p + (Math.random() * 5 + 2), 96);
        document.getElementById('loaderProgress').style.width = p + '%';
        document.getElementById('loaderPct').textContent = Math.floor(p) + '%';
        document.getElementById('receiverFill').style.height = p + '%';
        if (p > (tip + 1) * 12 && tip < tipsLoader.length - 1) {
            tip++;
            document.getElementById('loaderText').textContent = tipsLoader[tip];
        }
    }, 200);
}
function terminarLoader() {
    if (_loaderInterval) { clearInterval(_loaderInterval); _loaderInterval = null; }
    document.getElementById('loaderProgress').style.width = '100%';
    document.getElementById('loaderPct').textContent = '100%';
    document.getElementById('receiverFill').style.height = '100%';
    document.getElementById('loaderText').textContent = '¡Listo!';
    setTimeout(() => document.getElementById('loader-overlay').classList.add('hidden'), 400);
}

/* Toggle fuente */
function togglearFuente() {
    const nueva = FUENTE_ACTUAL === 'TSC' ? 'REAL' : 'TSC';
    if (nueva === 'REAL') {
        document.getElementById('modalReal').classList.add('show');
        return;
    }
    aplicarFuente('TSC');
}
function confirmarReal() {
    document.getElementById('modalReal').classList.remove('show');
    aplicarFuente('REAL');
}
function cancelarReal() {
    document.getElementById('modalReal').classList.remove('show');
}
function aplicarFuente(f) {
    FUENTE_ACTUAL = f;
    document.getElementById('optTSC').classList.toggle('active', f === 'TSC');
    const oR = document.getElementById('optREAL');
    oR.classList.toggle('active', f === 'REAL');
    oR.classList.toggle('real', f === 'REAL');
    document.getElementById('lblFuente').textContent =
        f === 'TSC' ? 'Vista TSC (Pronatel)' : '🔒 Vista REAL (uso interno)';
    cargarTodo();
}

/* Carga principal */
async function cargarTodo() {
    arrancarLoader();
    const tipoRed = document.getElementById('selTipoRed').value;
    const desde = document.getElementById('fDesde').value;
    const hasta = document.getElementById('fHasta').value;
    document.getElementById('slaTipo').textContent = tipoRed;
    document.getElementById('slaVal').textContent = SLA_BASE[tipoRed];
    document.getElementById('lblRango').textContent =
        `Período: ${desde || 'inicio'} → ${hasta || 'hoy'}`;

    const qs = `region=${REGION_CODE}&tipoRed=${tipoRed}&fuente=${FUENTE_ACTUAL}`
        + (desde ? `&desde=${desde}` : '')
        + (hasta ? `&hasta=${hasta}` : '');
    try {
        // El 4to fetch (acumulado) NO usa desde/hasta — período fijo
        const qsAcum = `region=${REGION_CODE}&tipoRed=${tipoRed}&fuente=${FUENTE_ACTUAL}`;
        const [r1, r2, r3, r4] = await Promise.all([
            fetch(`/api/reporte-diario/top10?${qs}`).then(r => r.json()),
            fetch(`/api/reporte-diario/alertas?${qs}`).then(r => r.json()),
            fetch(`/api/reporte-diario/tabla-desglose?${qs}`).then(r => r.json()),
            fetch(`/api/reporte-diario/tabla-acumulada?${qsAcum}`).then(r => r.json()),
        ]);
        _datosTop10 = r1;
        _datosAlertas = r2;
        _datosTabla = r3;
        _datosAcum = r4;
        document.getElementById('lblNodos').textContent =
            `${r1.total_nodos || 0} nodos analizados`;
        renderTop10(r1);
        renderIndispo(r1);
        renderAlertas(r2);
        poblarSelectorNodos(r1);
        renderTablaDesglose(r3);
        renderTablaAcumulada(r4);
    } catch (e) {
        console.error('Error:', e);
        alert('Error cargando datos. Revisa la consola.');
    } finally {
        terminarLoader();
    }
}

function renderTop10(data) {
    const items = data.top10 || [];
    if (_chartTop10) { _chartTop10.destroy(); _chartTop10 = null; }
    const canvas = document.getElementById('chartTop10');
    const wrap = canvas ? canvas.parentElement : document.querySelector('#chartTop10')?.parentElement;
    // Si el canvas fue reemplazado por un mensaje antes, restaurarlo
    if (!canvas) {
        const c = document.querySelector('.chart-wrap');
        // Buscar el wrap del Top10 (el primero) y restaurar el canvas
        const wraps = document.querySelectorAll('.chart-wrap');
        if (wraps.length >= 1) {
            wraps[0].innerHTML = '<canvas id="chartTop10"></canvas>';
        }
    }
    if (!items.length) {
        const c = document.getElementById('chartTop10');
        if (c) c.parentElement.innerHTML = mensajeSinDatos();
        return;
    }
    // Asegurar canvas presente
    let cv = document.getElementById('chartTop10');
    if (!cv) {
        const wraps = document.querySelectorAll('.chart-wrap');
        if (wraps.length >= 1) {
            wraps[0].innerHTML = '<canvas id="chartTop10"></canvas>';
            cv = document.getElementById('chartTop10');
        }
    }
    const ctx = cv.getContext('2d');
    _chartTop10 = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: items.map(x => nombreNodo(x.codigo_unico)),
            datasets: [{
                label: 'Horas atribuibles',
                data: items.map(x => x.horas),
                backgroundColor: items.map(x =>
                    x.estado === 'critico' ? '#dc2626' :
                        x.estado === 'alto' ? '#FFB932' : '#009CDE'),
                borderRadius: 4,
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: c => `${c.parsed.y} h (SLA base: ${SLA_BASE[document.getElementById('selTipoRed').value]} h)` } }
            },
            scales: {
                x: { ticks: { font: { size: 11, weight: '600' }, maxRotation: 30, minRotation: 30, autoSkip: false } },
                y: { title: { display: true, text: 'Horas' }, beginAtZero: true },
            },
        },
        plugins: [{
            id: 'umbral',
            beforeDatasetsDraw(chart) {
                const { ctx, chartArea, scales } = chart;
                const sla = SLA_BASE[document.getElementById('selTipoRed').value];
                const y = scales.y.getPixelForValue(sla);
                if (y >= chartArea.top && y <= chartArea.bottom) {
                    ctx.save();
                    ctx.strokeStyle = '#dc2626';
                    ctx.lineWidth = 2;
                    ctx.setLineDash([6, 4]);
                    ctx.beginPath();
                    ctx.moveTo(chartArea.left, y);
                    ctx.lineTo(chartArea.right, y);
                    ctx.stroke();
                    ctx.fillStyle = '#dc2626';
                    ctx.font = '700 10px Montserrat';
                    ctx.textAlign = 'right';
                    ctx.fillText(`Umbral SLA: ${sla} h`, chartArea.right - 6, y - 4);
                    ctx.restore();
                }
            }
        }, {
            id: 'labels',
            afterDatasetsDraw(chart) {
                const { ctx } = chart;
                chart.data.datasets[0].data.forEach((v, i) => {
                    const bar = chart.getDatasetMeta(0).data[i];
                    // VALOR CENTRADO sobre la barra (con halo blanco para legibilidad)
                    ctx.font = '700 11px Montserrat';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.textAlign = 'center';
                    ctx.font = 'bold 12px DM Mono, monospace';
                    const yCenter = (bar.y + bar.base) / 2;
                    // Halo negro grueso (legible sobre fondo claro Y oscuro)
                    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
                    ctx.lineWidth = 4;
                    ctx.lineJoin = 'round';
                    ctx.strokeText(v.toFixed(2), bar.x, yCenter);
                    // Texto blanco encima del halo
                    ctx.fillStyle = '#ffffff';
                    ctx.fillText(v.toFixed(2), bar.x, yCenter);
                });
            }
        }]
    });
}

function renderIndispo(data) {
    const items = data.top10 || [];
    if (_chartIndispo) { _chartIndispo.destroy(); _chartIndispo = null; }
    if (!items.length) {
        const c = document.getElementById('chartIndispo');
        if (c) c.parentElement.innerHTML = '<div class="no-data">Sin datos.</div>';
        return;
    }
    let cv = document.getElementById('chartIndispo');
    if (!cv) {
        const wraps = document.querySelectorAll('.chart-wrap');
        if (wraps.length >= 2) {
            wraps[1].innerHTML = '<canvas id="chartIndispo"></canvas>';
            cv = document.getElementById('chartIndispo');
        }
    }
    const ctx = cv.getContext('2d');
    const esPct = _vistaIndispo === 'pct';
    const vals = items.map(x => esPct ? x.indispo_pct : x.exceso_horas);

    _chartIndispo = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: items.map(x => nombreNodo(x.codigo_unico)),
            datasets: [{
                label: esPct ? 'Indisponibilidad %' : 'Exceso horas',
                data: vals,
                backgroundColor: '#7f1d1d',
                borderRadius: 4,
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: c => esPct
                            ? `${c.parsed.y}% (${items[c.dataIndex].horas} h sobre SLA ${data.sla_base_horas} h)`
                            : `+${c.parsed.y} h sobre base`
                    }
                }
            },
            scales: {
                x: { ticks: { font: { size: 11, weight: '600' }, maxRotation: 30, minRotation: 30, autoSkip: false } },
                y: { title: { display: true, text: esPct ? 'Porcentaje (%)' : 'Horas exceso' }, beginAtZero: true },
            },
        },
        plugins: [{
            id: 'umbral2',
            beforeDatasetsDraw(chart) {
                const { ctx, chartArea, scales } = chart;
                // El umbral es 100% (=1× SLA) si está en vista %, o 0h si está en vista horas
                const valor = esPct ? 100 : 0;
                const y = scales.y.getPixelForValue(valor);
                if (y >= chartArea.top && y <= chartArea.bottom) {
                    ctx.save();
                    ctx.strokeStyle = '#dc2626';
                    ctx.lineWidth = 2;
                    ctx.setLineDash([6, 4]);
                    ctx.beginPath();
                    ctx.moveTo(chartArea.left, y);
                    ctx.lineTo(chartArea.right, y);
                    ctx.stroke();
                    ctx.fillStyle = '#dc2626';
                    ctx.font = '700 10px Montserrat';
                    ctx.textAlign = 'right';
                    ctx.fillText(esPct ? 'Umbral SLA: 100%' : 'Umbral SLA: 0 h exceso',
                        chartArea.right - 6, y - 4);
                    ctx.restore();
                }
            }
        }, {
            id: 'labels2',
            afterDatasetsDraw(chart) {
                const { ctx } = chart;
                chart.data.datasets[0].data.forEach((v, i) => {
                    const bar = chart.getDatasetMeta(0).data[i];
                    ctx.font = '700 11px Montserrat';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.textAlign = 'center';
                    ctx.font = 'bold 12px DM Mono, monospace';
                    const yCenter = (bar.y + bar.base) / 2;
                    const txt = esPct ? v.toFixed(1) + '%' : '+' + v.toFixed(2) + 'h';
                    // Halo negro grueso (legible sobre cualquier color)
                    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
                    ctx.lineWidth = 4;
                    ctx.lineJoin = 'round';
                    ctx.strokeText(txt, bar.x, yCenter);
                    // Texto blanco encima del halo
                    ctx.fillStyle = '#ffffff';
                    ctx.fillText(txt, bar.x, yCenter);
                });
            }
        }]
    });
}
function cambiarVistaIndispo(v) {
    _vistaIndispo = v;
    document.getElementById('btnPct').classList.toggle('active', v === 'pct');
    document.getElementById('btnHoras').classList.toggle('active', v === 'horas');
    if (_datosTop10) renderIndispo(_datosTop10);
}

function renderAlertas(a) {
    const b = document.getElementById('alertsBanner');
    const chips = [];
    if (a.criticos && a.criticos.length)
        chips.push(`<div class="alert-chip-big red"><i class="fas fa-triangle-exclamation"></i> ${a.criticos.length} críticos (>1000% SLA)</div>`);
    if (a.sin_informe)
        chips.push(`<div class="alert-chip-big yellow"><i class="fas fa-file-circle-question"></i> ${a.sin_informe} sin código de informe</div>`);
    if (a.sin_ok)
        chips.push(`<div class="alert-chip-big gray"><i class="fas fa-circle-half-stroke"></i> ${a.sin_ok} con informe pero sin PRIMARY=OK</div>`);
    b.innerHTML = chips.join('') ||
        '<div class="alert-chip-big gray"><i class="fas fa-check-circle"></i> Sin alertas críticas</div>';

    if (a.deadline_msg) {
        document.getElementById('deadlineCard').style.display = 'block';
        document.getElementById('deadlineMsg').textContent = a.deadline_msg;
    } else {
        document.getElementById('deadlineCard').style.display = 'none';
    }

    const d = document.getElementById('alertasDetalle');
    if (!a.criticos || !a.criticos.length) {
        d.innerHTML = '<div class="no-data">No hay nodos en estado crítico.</div>';
        return;
    }
    d.innerHTML = '<div class="alert-list-detail">' +
        a.criticos.map(c =>
            `<div class="alert-detail critico">
        <strong>${nombreNodo(c.codigo_unico)}</strong> — ${c.horas}h afectadas — <strong>${c.pct}%</strong> sobre SLA base
      </div>`
        ).join('') + '</div>';
}

/* Modal Análisis por Nodos */
function poblarSelectorNodos(data) {
    const sel = document.getElementById('selNodo');
    sel.innerHTML = '<option value="">— Seleccione un nodo —</option>';
    (data.top10 || []).forEach(it => {
        const opt = document.createElement('option');
        opt.value = it.codigo_unico;
        opt.textContent = nombreNodo(it.codigo_unico) + ` (${it.horas}h, ${it.indispo_pct}%)`;
        sel.appendChild(opt);
    });
}
function abrirModalNodo() {
    if (!_datosTop10 || !_datosTop10.top10 || !_datosTop10.top10.length) {
        alert('Primero carga los datos del Top 10.');
        return;
    }
    document.getElementById('modalNodo').classList.add('show');
}
function cerrarModalNodo() {
    document.getElementById('modalNodo').classList.remove('show');
}
async function cargarDetalleNodo() {
    const codigo = document.getElementById('selNodo').value;
    const cont = document.getElementById('nodoDetalleContent');
    if (!codigo) {
        cont.innerHTML = '<div class="no-data">Selecciona un nodo para ver su detalle completo.</div>';
        return;
    }
    cont.innerHTML = '<div class="no-data">⏳ Cargando detalle…</div>';
    try {
        const r = await fetch(`/api/reporte-diario/nodo-detalle?codigo=${encodeURIComponent(codigo)}`);
        const d = await r.json();
        if (d.error) {
            cont.innerHTML = `<div class="no-data">Error: ${d.error}</div>`;
            return;
        }
        cont.innerHTML = renderNodoDetalle(d);
    } catch (e) {
        cont.innerHTML = `<div class="no-data">Error: ${e.message}</div>`;
    }
}
function renderNodoDetalle(d) {
    const i = d.identificacion, f = d.fechas_y_duracion, s = d.sla;
    const ar = d.atribuibilidad_real, at = d.atribuibilidad_tsc;
    const g = d.gestion, e = d.sla_energia;
    const pctR = Math.min(s.pct_real, 2500), pctT = Math.min(s.pct_tsc, 2500);

    const filaAtrib = (lbl, vR, vT) => `
    <tr>
      <td><strong>${lbl}</strong></td>
      <td class="right">${vR.toFixed(2)}</td>
      <td class="right">${vT.toFixed(2)}</td>
    </tr>`;

    return `
    <div style="background:linear-gradient(135deg,var(--blue),#0078b3);color:#fff;padding:14px 18px;border-radius:8px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="font-size:10px;text-transform:uppercase;opacity:.85;letter-spacing:1.5px;">Nodo</div>
        <div style="font-size:18px;font-weight:800;font-family:var(--mono);margin-top:2px;">${d.nodo_limpio}</div>
      </div>
      <div style="text-align:right;font-size:10px;opacity:.85;text-transform:uppercase;">
        ${i.region} · ${i.sistema}<br>${i.site_id}
      </div>
    </div>

    <div class="det-card" style="margin-bottom:14px;">
      <div class="det-card-title"><i class="fas fa-gauge-high"></i> SLA — Comparativa TSC vs REAL</div>
      <div class="sla-bars">
        <div class="sla-bar-box tsc">
          <div class="sla-bar-label">🎭 TSC (Pronatel)</div>
          <div class="sla-bar-value">${s.horas_tsc} <span style="font-size:11px;color:var(--muted);">h</span></div>
          <div class="sla-bar-meter"><div class="sla-bar-fill tsc" style="width:${Math.min(pctT / 25, 100)}%;"></div></div>
          <div class="sla-bar-meta">${s.pct_tsc}% del SLA · <span class="estado-badge ${s.estado_tsc}">${s.estado_tsc}</span></div>
        </div>
        <div class="sla-bar-box real">
          <div class="sla-bar-label">🔒 REAL (interno)</div>
          <div class="sla-bar-value">${s.horas_real} <span style="font-size:11px;color:var(--muted);">h</span></div>
          <div class="sla-bar-meter"><div class="sla-bar-fill real" style="width:${Math.min(pctR / 25, 100)}%;"></div></div>
          <div class="sla-bar-meta">${s.pct_real}% del SLA · <span class="estado-badge ${s.estado_real}">${s.estado_real}</span></div>
        </div>
      </div>
      <div style="margin-top:10px;font-size:10px;color:var(--muted);text-align:center;">
        SLA Base: <strong>${s.base_horas} h</strong> · Exceso TSC: <strong>+${s.exceso_tsc} h</strong> · Exceso REAL: <strong>+${s.exceso_real} h</strong>
      </div>
    </div>

    <div class="det-grid">
      <div class="det-card">
        <div class="det-card-title"><i class="fas fa-id-card"></i> Identificación</div>
        <div class="det-row"><span class="det-label">Site Name</span><span class="det-value">${i.site_name || '—'}</span></div>
        <div class="det-row"><span class="det-label">Site ID</span><span class="det-value">${i.site_id || '—'}</span></div>
        <div class="det-row"><span class="det-label">Severity</span><span class="det-value">${i.severity || '—'}</span></div>
        <div class="det-row"><span class="det-label">Alarm Name</span><span class="det-value">${i.alarm_name || '—'}</span></div>
        <div class="det-row"><span class="det-label">Object Type</span><span class="det-value">${i.alarmed_object_type || '—'}</span></div>
        <div class="det-row"><span class="det-label">Object Name</span><span class="det-value">${i.alarmed_object_name || '—'}</span></div>
        <div class="det-row"><span class="det-label">Probable Cause</span><span class="det-value">${i.probable_cause || '—'}</span></div>
      </div>

      <div class="det-card">
        <div class="det-card-title"><i class="fas fa-clock"></i> Fechas y Duración</div>
        <div class="det-row"><span class="det-label">Time Logged</span><span class="det-value">${f.time_logged || '—'}</span></div>
        <div class="det-row"><span class="det-label">Last Detected</span><span class="det-value">${f.last_time_detected || '—'}</span></div>
        <div class="det-row"><span class="det-label">Duration (str)</span><span class="det-value">${f.duration_str || '—'}</span></div>
        <div class="det-row"><span class="det-label">Total horas</span><span class="det-value">${f.total_en_horas} h</span></div>
        <div class="det-row"><span class="det-label">¿Mayor a 30 min?</span><span class="det-value">${f.mayor_30_min}</span></div>
      </div>
    </div>

    <div class="det-card" style="margin-bottom:14px;">
      <div class="det-card-title"><i class="fas fa-layer-group"></i> Atribuibilidad Desglosada — REAL vs TSC</div>
      <table class="atrib-table">
        <thead><tr><th>Componente</th><th class="right">REAL (h)</th><th class="right">TSC (h)</th></tr></thead>
        <tbody>
          ${filaAtrib('Flapping', ar.flapping, at.flapping)}
          ${filaAtrib('Inside Plant', ar.inside_plant, at.inside_plant)}
          ${filaAtrib('Battery', ar.battery, at.battery)}
          ${filaAtrib('UBT Fault', ar.ubt_fault, at.ubt_fault)}
          ${filaAtrib('SFP Fault', ar.sfp_fault, at.sfp_fault)}
          ${filaAtrib('Others', ar.others, at.others)}
        </tbody>
        <tfoot>
          <tr><td>TOTAL</td><td class="right">${ar.total.toFixed(2)}</td><td class="right">${at.total.toFixed(2)}</td></tr>
        </tfoot>
      </table>
    </div>

    <div class="det-grid">
      <div class="det-card">
        <div class="det-card-title"><i class="fas fa-clipboard-check"></i> Gestión del Analista</div>
        <div class="det-row"><span class="det-label">Código Informe</span><span class="det-value">${g.codigo_informe || '—'}</span></div>
        <div class="det-row"><span class="det-label">Motivo REAL</span><span class="det-value">${g.motivo_real || '—'}</span></div>
        <div class="det-row"><span class="det-label">Motivo TSC</span><span class="det-value">${g.motivo_tsc || '—'}</span></div>
        <div class="det-row"><span class="det-label">Tipo REAL</span><span class="det-value">${g.tipo_real || '—'}</span></div>
        <div class="det-row"><span class="det-label">Tipo TSC</span><span class="det-value">${g.tipo_tsc || '—'}</span></div>
        <div class="det-row"><span class="det-label">Tipo Flapping</span><span class="det-value">${g.tipo_flapping || '—'}</span></div>
        <div class="det-row"><span class="det-label">Status</span><span class="det-value">${g.status_document || '—'}</span></div>
        <div class="det-row"><span class="det-label">Primary</span><span class="det-value">${g.primary_issue || '—'}</span></div>
        <div class="det-row"><span class="det-label">Event Ticket</span><span class="det-value">${g.event_ticket || '—'}</span></div>
        <div class="det-row"><span class="det-label">WO/TT/INC</span><span class="det-value">${g.wo_tt_inc || '—'}</span></div>
        <div class="det-row"><span class="det-label">Comentario</span><span class="det-value">${g.comentario_real || '—'}</span></div>
        <div class="det-row"><span class="det-label">Problema</span><span class="det-value">${g.problema || '—'}</span></div>
        <div class="det-row"><span class="det-label">Motivo Exclusión</span><span class="det-value">${g.motivo_exclusion || '—'}</span></div>
      </div>

      <div class="det-card">
        <div class="det-card-title"><i class="fas fa-battery-three-quarters"></i> SLA Energía</div>
        <div class="det-row"><span class="det-label">Autonomía Ideal</span><span class="det-value">${e.autonomia_ideal} h</span></div>
        <div class="det-row"><span class="det-label">Autonomía Real</span><span class="det-value">${e.autonomia_real} h</span></div>
        <div class="det-row"><span class="det-label">Autonomía Pendiente</span><span class="det-value">${e.autonomia_pendiente} h</span></div>
        <div class="det-row"><span class="det-label">Horas no atribuibles</span><span class="det-value">${e.horas_no_atribuibles} h</span></div>
        <div class="det-row"><span class="det-label">Hora corte PEIM</span><span class="det-value">${e.hora_corte_peim || '—'}</span></div>
      </div>
    </div>
  `;
}

/* Dropdown export */
function togglearExportMenu(ev) {
    ev.stopPropagation();
    document.getElementById('exportMenu').classList.toggle('show');
}
document.addEventListener('click', () => {
    document.getElementById('exportMenu').classList.remove('show');
});

/* Export PDF (window.print) */
function exportarPDF(ev) {
    ev.preventDefault();
    document.getElementById('exportMenu').classList.remove('show');
    window.print();
}

/* Export Excel (SheetJS) */
function exportarExcel(ev) {
    ev.preventDefault();
    document.getElementById('exportMenu').classList.remove('show');
    if (!_datosTop10) { alert('Carga primero los datos.'); return; }

    const wb = XLSX.utils.book_new();

    // Hoja 1: Top 10
    const top10Rows = [['Nodo', 'Horas', 'SLA Base', 'Indispo %', 'Exceso h', 'Estado']];
    (_datosTop10.top10 || []).forEach(x => {
        top10Rows.push([nombreNodo(x.codigo_unico), x.horas, x.sla_base,
        x.indispo_pct, x.exceso_horas, x.estado]);
    });
    const ws1 = XLSX.utils.aoa_to_sheet(top10Rows);
    XLSX.utils.book_append_sheet(wb, ws1, 'Top 10');

    // Hoja 2: Tabla de Desglose
    if (_datosTabla && _datosTabla.tabla && _datosTabla.tabla.length) {
        const desgRows = [['Nodo', 'AVAIL', 'TOTAL', 'JUSTIF', 'FLAPPING', 'INSIDE_PLANT',
            'BATTERY', 'UBT_FAULT', 'SFP_FAULT', 'OTHERS', 'OOS']];
        _datosTabla.tabla.forEach(r => {
            desgRows.push([r.nodo, r.AVAIL, r.TOTAL, r.JUSTIF, r.FLAPPING,
            r.INSIDE_PLANT, r.BATTERY, r.UBT_FAULT,
            r.SFP_FAULT, r.OTHERS, r.OOS]);
        });
        const wsD = XLSX.utils.aoa_to_sheet(desgRows);
        XLSX.utils.book_append_sheet(wb, wsD, 'Desglose Top10');
    }

    // Hoja 3: Alertas críticas
    if (_datosAlertas && _datosAlertas.criticos) {
        const alRows = [['Nodo', 'Horas', '% SLA']];
        _datosAlertas.criticos.forEach(c => {
            alRows.push([nombreNodo(c.codigo_unico), c.horas, c.pct]);
        });
        const ws2 = XLSX.utils.aoa_to_sheet(alRows);
        XLSX.utils.book_append_sheet(wb, ws2, 'Críticos');
    }

    // Hoja 3: Resumen
    const meta = [
        ['Reporte Diario de Disponibilidad'],
        [],
        ['Región', REGION_NAME],
        ['Tipo Red', document.getElementById('selTipoRed').value],
        ['Vista (fuente)', FUENTE_ACTUAL],
        ['Desde', document.getElementById('fDesde').value],
        ['Hasta', document.getElementById('fHasta').value],
        ['Total nodos analizados', _datosTop10.total_nodos],
        ['SLA Base (h)', _datosTop10.sla_base_horas],
        ['Generado', new Date().toLocaleString()],
    ];
    const ws3 = XLSX.utils.aoa_to_sheet(meta);
    XLSX.utils.book_append_sheet(wb, ws3, 'Resumen');

    const ts = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    XLSX.writeFile(wb, `reporte-diario-${REGION_CODE}-${FUENTE_ACTUAL}-${ts}.xlsx`);
}

function mostrarProximamente(ev) {
    ev.preventDefault();
    document.getElementById('exportMenu').classList.remove('show');
    document.getElementById('modalProx').classList.add('show');
}

/* Descargar PNG */
function descargarChart(canvasId, nombre) {
    const c = document.getElementById(canvasId);
    const a = document.createElement('a');
    a.href = c.toDataURL('image/png');
    a.download = `${nombre}-${REGION_CODE}-${FUENTE_ACTUAL}.png`;
    a.click();
}

/* Inicio */
window.addEventListener('DOMContentLoaded', () => { cargarTodo(); });

/* ═══════ TABLA DE DESGLOSE ═══════ */
function renderTablaDesglose(data) {
    const wrap = document.getElementById('tablaDesgloseWrap');
    const filas = (data && data.tabla) || [];
    if (!filas.length) {
        wrap.innerHTML = '<div class="no-data">Sin datos para esta combinación de filtros.</div>';
        return;
    }
    const cell = (v, extra = '') => {
        const isZero = !v || v === 0;
        return `<td class="${isZero ? 'zero' : ''} ${extra}">${isZero ? '—' : v.toFixed(2)}</td>`;
    };
    let html = `
    <table class="tabla-desglose">
      <thead><tr>
        <th class="col-nodos">NODES</th>
        <th class="col-avail">AVAIL.</th>
        <th class="col-total">TOTAL</th>
        <th class="col-justif">JUSTIF.</th>
        <th class="col-flapping">FLAPPING</th>
        <th class="col-comp">INSIDE_PL</th>
        <th class="col-comp">BATTERY</th>
        <th class="col-comp">UBT</th>
        <th class="col-comp">SFP</th>
        <th class="col-comp">OTHERS</th>
      </tr></thead>
      <tbody>`;
    filas.forEach(r => {
        const availClass = r.AVAIL < 0 ? 'avail-neg' : '';
        html += `<tr>
      <td class="nodo-cell" onclick="abrirDetalleDesdeTabla('${r.codigo_unico.replace(/'/g, "\\'")}')">
        <i class="fas fa-microscope" style="font-size:9px;color:var(--muted);margin-right:5px;"></i>${r.nodo}
      </td>
      <td class="${availClass}">${r.AVAIL.toFixed(2)}</td>
      <td class="highlight">${r.TOTAL.toFixed(2)}</td>
      ${cell(r.JUSTIF)}
      ${cell(r.FLAPPING)}
      ${cell(r.INSIDE_PLANT)}
      ${cell(r.BATTERY)}
      ${cell(r.UBT_FAULT)}
      ${cell(r.SFP_FAULT)}
      ${cell(r.OTHERS)}
    </tr>`;
    });
    html += '</tbody></table>';
    wrap.innerHTML = html;
}

function abrirDetalleDesdeTabla(codigoUnico) {
    // Abre el modal del nodo y selecciona ese código
    abrirModalNodo();
    setTimeout(() => {
        const sel = document.getElementById('selNodo');
        // Buscar la opción que coincida
        for (let i = 0; i < sel.options.length; i++) {
            if (sel.options[i].value === codigoUnico) {
                sel.selectedIndex = i;
                cargarDetalleNodo();
                return;
            }
        }
        // Si no está en el selector (no es del Top 10 actual), forzar carga manual
        sel.innerHTML += `<option value="${codigoUnico}" selected>${codigoUnico.split(' - ').pop()} (desde tabla)</option>`;
        cargarDetalleNodo();
    }, 100);
}

function exportarTablaDesglose() {
    if (!_datosTabla || !_datosTabla.tabla || !_datosTabla.tabla.length) {
        alert('No hay datos para exportar.');
        return;
    }
    const wb = XLSX.utils.book_new();
    const headers = ['NODOS', 'AVAIL', 'TOTAL', 'JUSTIF', 'FLAPPING', 'INSIDE_PLANT',
        'BATTERY', 'UBT_FAULT', 'SFP_FAULT', 'OTHERS', 'OOS'];
    const rows = [headers];
    _datosTabla.tabla.forEach(r => {
        rows.push([r.nodo, r.AVAIL, r.TOTAL, r.JUSTIF, r.FLAPPING, r.INSIDE_PLANT,
        r.BATTERY, r.UBT_FAULT, r.SFP_FAULT, r.OTHERS, r.OOS]);
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Desglose Top10');
    const ts = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    XLSX.writeFile(wb, `desglose-top10-${REGION_CODE}-${FUENTE_ACTUAL}-${ts}.xlsx`);
}


/* ═══════ TABLA TOP 3 ACUMULADO HISTÓRICO ═══════ */
function renderTablaAcumulada(data) {
    const wrap = document.getElementById('tablaAcumuladaWrap');
    const filas = (data && data.tabla) || [];
    if (data && data.periodo) {
        document.getElementById('acumPeriodo').textContent = data.periodo;
    }
    if (!filas.length) {
        wrap.innerHTML = '<div class="no-data">Sin datos en el período histórico.</div>';
        return;
    }
    const cell = (v, extra = '') => {
        const isZero = !v || v === 0;
        return `<td class="${isZero ? 'zero' : ''} ${extra}">${isZero ? '—' : v.toFixed(2)}</td>`;
    };
    let h = `
    <table class="tabla-desglose">
      <thead><tr>
        <th class="col-nodos">NODES</th>
        <th class="col-avail">AVAIL.</th>
        <th class="col-total">TOTAL</th>
        <th class="col-justif">JUSTIF.</th>
        <th class="col-flapping">FLAPPING</th>
        <th class="col-comp">INSIDE_PL</th>
        <th class="col-comp">BATTERY</th>
        <th class="col-comp">UBT</th>
        <th class="col-comp">SFP</th>
        <th class="col-comp">OTHERS</th>
      </tr></thead>
      <tbody>`;
    filas.forEach(r => {
        const availClass = r.AVAIL < 0 ? 'avail-neg' : '';
        h += `<tr>
      <td class="nodo-cell" onclick="abrirDetalleDesdeTabla('${r.codigo_unico.replace(/'/g, "\\'")}')">
        <i class="fas fa-microscope" style="font-size:9px;color:var(--muted);margin-right:5px;"></i>${r.nodo}
      </td>
      <td class="${availClass}">${r.AVAIL.toFixed(2)}</td>
      <td class="highlight">${r.TOTAL.toFixed(2)}</td>
      ${cell(r.JUSTIF)}
      ${cell(r.FLAPPING)}
      ${cell(r.INSIDE_PLANT)}
      ${cell(r.BATTERY)}
      ${cell(r.UBT_FAULT)}
      ${cell(r.SFP_FAULT)}
      ${cell(r.OTHERS)}
    </tr>`;
    });
    h += '</tbody></table>';
    wrap.innerHTML = h;
}

function exportarTablaAcumulada() {
    if (!_datosAcum || !_datosAcum.tabla || !_datosAcum.tabla.length) {
        alert('No hay datos para exportar.'); return;
    }
    const wb = XLSX.utils.book_new();
    const rows = [['Nodo', 'AVAIL', 'TOTAL', 'JUSTIF', 'FLAPPING', 'INSIDE_PLANT',
        'BATTERY', 'UBT_FAULT', 'SFP_FAULT', 'OTHERS', 'OOS']];
    _datosAcum.tabla.forEach(r => {
        rows.push([r.nodo, r.AVAIL, r.TOTAL, r.JUSTIF, r.FLAPPING, r.INSIDE_PLANT,
        r.BATTERY, r.UBT_FAULT, r.SFP_FAULT, r.OTHERS, r.OOS]);
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Top 3 Acumulado');
    const ts = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    XLSX.writeFile(wb, `top3-acumulado-${REGION_CODE}-${FUENTE_ACTUAL}-${ts}.xlsx`);
}


/* ═════ DEADLINE GLOBAL (topbar central) ═════ */
function pad2(n) { return String(n).padStart(2, '0'); }
function actualizarDeadlineTopbar() {
    const box = document.getElementById('deadlineTopbar');
    if (!box) return;
    const t = document.getElementById('deadlineTimeTb');
    const ahora = new Date();
    const dow = ahora.getDay();
    let diasHasta;
    if (dow < 5) diasHasta = 5 - dow;
    else if (dow === 5) diasHasta = ahora.getHours() < 12 ? 0 : 7;
    else diasHasta = 5 - dow + 7;
    const proxViernes = new Date(ahora);
    proxViernes.setDate(ahora.getDate() + diasHasta);
    proxViernes.setHours(12, 0, 0, 0);

    let diff = proxViernes - ahora;
    if (diff < 0) { box.style.display = 'none'; return; }
    box.style.display = 'flex';

    const dias = Math.floor(diff / 86400000);
    const hrs = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);

    box.classList.remove('urgent', 'critical');
    if (diff < 86400000) box.classList.add('critical');
    else if (diff < 2 * 86400000) box.classList.add('urgent');

    if (dias > 0) t.textContent = `${dias}d ${pad2(hrs)}h ${pad2(mins)}m`;
    else t.textContent = `${pad2(hrs)}:${pad2(mins)}:${pad2(secs)} ⚠️`;
}
setInterval(actualizarDeadlineTopbar, 1000);
actualizarDeadlineTopbar();



/* ═════ Mensaje UX cuando no hay datos ═════ */
function mensajeSinDatos() {
    const tipoRed = document.getElementById('selTipoRed').value;
    const desde = document.getElementById('fDesde').value;
    const hasta = document.getElementById('fHasta').value;
    return `<div class="no-data" style="text-align:left;max-width:520px;margin:30px auto;padding:24px;background:var(--blue-l);border-radius:10px;border-left:4px solid var(--blue);">
    <div style="font-size:14px;font-weight:700;color:var(--blue);margin-bottom:10px;">
      <i class="fas fa-info-circle"></i>&nbsp;No hay registros con atribuibilidad YOFC en este período
    </div>
    <div style="font-size:12px;color:var(--text);line-height:1.7;">
      <strong>Filtros activos:</strong><br>
      • Región: <strong>${REGION_NAME}</strong><br>
      • Tipo Red: <strong>${tipoRed}</strong> (SLA base: ${SLA_BASE[tipoRed]} h)<br>
      • Período: <strong>${desde}</strong> → <strong>${hasta}</strong><br>
      • Vista: <strong>${FUENTE_ACTUAL}</strong><br>
      <br>
      <strong>Posibles razones:</strong><br>
      <span style="color:var(--muted);">
        • Cambia el filtro Año-Mes (probar "Todos los registros")<br>
        • Cambia el tipo de red (TX ↔ AX)<br>
        • Si todos los eventos fueron justificados (RED DORSAL, CORTE FIBRA, CONCESIONARIA), 
          no hay nada atribuible a YOFC en este período ✅
      </span>
    </div>
  </div>`;
}

/* ═════ SISTEMA DE ALERTAS YOFC ═════ */
let _alertasYofcData = null;
let _alertasYofcInterval = null;
let _alertasYofcPaused = false;
const REGION_YOFC = (typeof REGION_CODE !== 'undefined') ? REGION_CODE : '';

async function cargarAlertasYofc() {
    try {
        const r = await fetch(`/api/alertas-yofc?region=${REGION_YOFC}`);
        const data = await r.json();
        if (data.error) {
            console.error('alertas-yofc:', data.error);
            return;
        }
        _alertasYofcData = data;
        renderBannerYofc(data);
        actualizarBotonAlertasYofc(data);
        // Solo abrir popup automáticamente si hay críticas y no fue pausado
        if (data.criticas > 0 && !_alertasYofcPaused && !sessionStorage.getItem('yofc_visto_' + sesionId())) {
            abrirModalAlertasYofc();
            sessionStorage.setItem('yofc_visto_' + sesionId(), '1');
        }
    } catch (e) { console.error(e); }
}

function sesionId() {
    // ID único por sesión + región para no spammear
    return REGION_YOFC + '_' + new Date().toISOString().slice(0, 10);
}

function renderBannerYofc(data) {
    const banner = document.getElementById('yofc-banner');
    const txt = document.getElementById('yofcBannerText');
    if (!banner || !txt) return;

    if (!data.alertas || !data.alertas.length) {
        banner.classList.remove('show');
        return;
    }
    // Si el usuario lo cerró, no reaparecer en la misma sesión
    if (sessionStorage.getItem('yofc_banner_closed_' + REGION_YOFC) === '1') {
        return;
    }
    // Construir texto del marquee
    const parts = data.alertas.slice(0, 30).map(a => {
        const tag = a.severidad === 'critica' ? '🔴' : (a.severidad === 'alta' ? '🟠' : '🟡');
        const cls = a.severidad === 'critica' ? 'critica' : '';
        return `<span class="${cls}">${tag} ${a.codigo_informe} (${a.dias_habiles} días hábiles vencidos)</span>`;
    }).join('');
    txt.innerHTML = parts + parts; // Duplicar para loop continuo
    banner.classList.add('show');
}

function cerrarBannerYofc() {
    document.getElementById('yofc-banner').classList.remove('show');
    sessionStorage.setItem('yofc_banner_closed_' + REGION_YOFC, '1');
}

function actualizarBotonAlertasYofc(data) {
    const btn = document.getElementById('yofcAlertBtn');
    if (!btn) return;
    if (!data.alertas || !data.alertas.length) {
        btn.style.display = 'none';
        return;
    }
    btn.style.display = 'flex';
    const badge = btn.querySelector('.yofc-alert-badge');
    if (badge) badge.textContent = data.total;
    btn.classList.toggle('has-criticas', data.criticas > 0);
}

function abrirModalAlertasYofc() {
    if (!_alertasYofcData) return;
    const modal = document.getElementById('modalAlertasYofc');
    modal.style.display = 'flex';
    const summary = document.getElementById('malYofcSummary');
    const lista = document.getElementById('malYofcLista');
    summary.innerHTML = `
    <span class="mal-yofc-chip crit">${_alertasYofcData.criticas} críticas (≥10 días)</span>
    <span class="mal-yofc-chip alta">${_alertasYofcData.altas} altas (7-9 días)</span>
    <span class="mal-yofc-chip media">${_alertasYofcData.medias} medias (4-6 días)</span>
  `;
    if (!_alertasYofcData.alertas.length) {
        lista.innerHTML = '<div style="text-align:center;padding:30px;color:#666;">No hay códigos pendientes.</div>';
        return;
    }
    lista.innerHTML = _alertasYofcData.alertas.map(a => `
    <div class="alerta-yofc-item ${a.severidad}">
      <div class="alerta-yofc-info">
        <div class="alerta-yofc-codigo">${a.codigo_informe}</div>
        <div class="alerta-yofc-meta">
          ${a.region} · ${a.sistema} · ${a.site || '—'}<br>
          Evento terminó: <strong>${a.fecha_evento}</strong> · Status: <strong>${a.status}</strong>
          ${typeof abrirDetalleDesdeTabla === 'function' ? `<br><span class="alerta-yofc-link" onclick="cerrarModalAlertasYofc();abrirDetalleDesdeTabla('${a.codigo_unico.replace(/'/g, "\\'")}')"><i class="fas fa-microscope"></i> Ver análisis del nodo</span>` : ''}
        </div>
      </div>
      <div class="alerta-yofc-dias">${a.dias_habiles}d</div>
    </div>
  `).join('');
}

function cerrarModalAlertasYofc() {
    document.getElementById('modalAlertasYofc').style.display = 'none';
}

function recordarAlertasYofc() {
    cerrarModalAlertasYofc();
    _alertasYofcPaused = true;
    setTimeout(() => { _alertasYofcPaused = false; }, 5 * 60 * 1000);
}

// Cargar al inicio
cargarAlertasYofc();
// Refrescar cada 5 minutos
if (_alertasYofcInterval) clearInterval(_alertasYofcInterval);
_alertasYofcInterval = setInterval(cargarAlertasYofc, 5 * 60 * 1000);



/* ═════ EXPORT PPT TOP 10 (tabla + gráfica) ═════ */
function exportarPptTop10(ev) {
    ev.preventDefault();
    document.getElementById('exportMenu').classList.remove('show');
    const tipoRed = document.getElementById('selTipoRed').value;
    const desde = document.getElementById('fDesde').value;
    const hasta = document.getElementById('fHasta').value;
    let url = `/api/reporte-diario/export-ppt-top10`
        + `?region=${REGION_CODE}&tipoRed=${tipoRed}&fuente=${FUENTE_ACTUAL}`
        + (desde ? `&desde=${desde}` : '')
        + (hasta ? `&hasta=${hasta}` : '');
    // Abrir en nueva pestaña dispara la descarga sin recargar
    window.open(url, '_blank');
}


/* DROPDOWN VISTA */
function toggleVistaMenu() {
    const m = document.getElementById('vistaMenu');
    if (m) m.classList.toggle('show');
}
document.addEventListener('click', (e) => {
    const dd = document.getElementById('vistaDropdown');
    const m = document.getElementById('vistaMenu');
    if (dd && m && !dd.contains(e.target)) m.classList.remove('show');
});