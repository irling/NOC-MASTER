const REGION_CODE = '{{ region_code }}';
const SLA_BASE = { 'TX': 0.8667, 'AX': 175.2 };
let _chartEvolucion = null;

function pad2(n) { return String(n).padStart(2, '0'); }

function updateClock() {
    const d = new Date();
    document.getElementById('clock').textContent =
        pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
}
setInterval(updateClock, 1000); updateClock();

function actualizarDeadline() {
    const box = document.getElementById('deadlineBar');
    if (!box) return;
    const t = document.getElementById('deadlineTime');
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
    t.textContent = dias + 'd ' + pad2(hrs) + 'h ' + pad2(mins) + 'm';
}
setInterval(actualizarDeadline, 1000);
actualizarDeadline();

function toggleVistaMenu() {
    const m = document.getElementById('vistaMenu');
    if (m) m.classList.toggle('show');
}
document.addEventListener('click', (e) => {
    const dd = document.getElementById('vistaDropdown');
    const m = document.getElementById('vistaMenu');
    if (dd && m && !dd.contains(e.target)) m.classList.remove('show');
});

async function cargarAnios() {
    const tipoRed = document.getElementById('selTipoRed').value;
    try {
        const r = await fetch('/api/reporte-anual/anios-disponibles?region=' + REGION_CODE + '&tipoRed=' + tipoRed);
        const d = await r.json();
        const sel = document.getElementById('selAnio');
        if (d.anios && d.anios.length) {
            sel.innerHTML = d.anios.map(a => '<option value="' + a + '">' + a + '</option>').join('');
            // Default: 2025 si existe, sino el año más reciente
            if (d.anios.includes(2025)) sel.value = 2025;
        } else {
            sel.innerHTML = '<option>Sin datos</option>';
        }
    } catch (e) { console.error('cargarAnios:', e); }
}

function fmtNum(v) {
    return Number(v).toLocaleString('es-PE', { maximumFractionDigits: 2 });
}

function renderKPIs(k, anio) {
    document.getElementById('kpiHoras').textContent = fmtNum(k.total_horas);
    document.getElementById('kpiHorasDet').textContent = 'Atribuibles YOFC en ' + anio;
    document.getElementById('kpiNodos').textContent = k.total_nodos;
    document.getElementById('kpiNodosDet').textContent = k.nodos_excedidos + ' excedieron el SLA';
    document.getElementById('kpiSLA').textContent = k.pct_sla;
    document.getElementById('kpiSLADet').textContent = (k.total_nodos - k.nodos_excedidos) + ' de ' + k.total_nodos + ' nodos OK';
    document.getElementById('kpiMesPeor').textContent = k.mes_peor.nombre;
    document.getElementById('kpiMesPeorDet').textContent = k.mes_peor.horas + ' h afectadas';
}

function renderEvolucion(serie) {
    const ctx = document.getElementById('chartEvolucion').getContext('2d');
    if (_chartEvolucion) { _chartEvolucion.destroy(); }
    _chartEvolucion = new Chart(ctx, {
        type: 'line',
        data: {
            labels: serie.map(m => m.mes),
            datasets: [{
                label: 'Horas YOFC',
                data: serie.map(m => m.horas),
                borderColor: '#009CDE',
                backgroundColor: 'rgba(0,156,222,.12)',
                borderWidth: 3,
                pointBackgroundColor: '#009CDE',
                pointRadius: 5,
                pointHoverRadius: 7,
                tension: 0.3,
                fill: true,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: c => c.parsed.y.toFixed(2) + ' h | ' + serie[c.dataIndex].nodos + ' nodos'
                    }
                }
            },
            scales: {
                y: { beginAtZero: true, title: { display: true, text: 'Horas' } },
                x: { grid: { display: false } }
            }
        },
        plugins: [{
            id: 'valoresLinea',
            afterDatasetsDraw(chart) {
                const { ctx } = chart;
                chart.data.datasets[0].data.forEach((v, i) => {
                    if (v <= 0) return;
                    const meta = chart.getDatasetMeta(0).data[i];
                    ctx.save();
                    ctx.font = 'bold 11px DM Mono, monospace';
                    ctx.textAlign = 'center';
                    ctx.fillStyle = '#0078b3';
                    ctx.fillText(v.toFixed(2) + 'h', meta.x, meta.y - 12);
                    ctx.restore();
                });
            }
        }]
    });
}

function renderTop10(top) {
    const wrap = document.getElementById('top10Wrap');
    if (!top.length) {
        wrap.innerHTML = '<div class="no-data">📭 Sin datos en este año.</div>';
        return;
    }
    const filas = top.map((n, i) => {
        const badge = n.status === 'critico' ? 'status-critico' : (n.status === 'alto' ? 'status-alto' : 'status-normal');
        const label = n.status === 'critico' ? 'Crítico' : (n.status === 'alto' ? 'Alto' : 'Normal');
        return '<tr>' +
            '<td>#' + (i + 1) + '</td>' +
            '<td class="nodo">' + n.nodo + '</td>' +
            '<td class="right">' + n.horas.toFixed(2) + ' h</td>' +
            '<td class="right">' + n.avail_pct + '%</td>' +
            '<td><span class="status-badge ' + badge + '">' + label + '</span></td>' +
            '</tr>';
    }).join('');
    wrap.innerHTML = '<table class="top10-table"><thead><tr><th>#</th><th>Nodo</th><th class="right">Horas Anuales</th><th class="right">Avail %</th><th>Status</th></tr></thead><tbody>' + filas + '</tbody></table>';
}

async function cargarTodo() {
    document.getElementById('loader-overlay').classList.remove('hidden');
    const tipoRed = document.getElementById('selTipoRed').value;
    const fuente = document.getElementById('selFuente').value;
    const anio = document.getElementById('selAnio').value;
    document.getElementById('slaTipo').textContent = tipoRed;
    document.getElementById('slaVal').textContent = SLA_BASE[tipoRed];

    try {
        const r = await fetch('/api/reporte-anual/resumen?region=' + REGION_CODE + '&tipoRed=' + tipoRed + '&fuente=' + fuente + '&anio=' + anio);
        const d = await r.json();
        if (d.error) {
            document.getElementById('subtitulo').textContent = '⚠️ Error: ' + d.error;
            return;
        }
        document.getElementById('subtitulo').textContent =
            'Vista ' + fuente + ' · Año ' + d.anio + ' · ' + d.kpis.total_nodos + ' nodos · SLA base ' + d.sla_base + ' h';
        renderKPIs(d.kpis, d.anio);
        renderEvolucion(d.serie_mensual);
        renderTop10(d.top10);
    } catch (e) {
        document.getElementById('subtitulo').textContent = '⚠️ ' + e.message;
    } finally {
        setTimeout(() => document.getElementById('loader-overlay').classList.add('hidden'), 300);
    }
}

window.addEventListener('DOMContentLoaded', async () => {
    await cargarAnios();
    await cargarTodo();
});

document.getElementById('selTipoRed').addEventListener('change', cargarAnios);