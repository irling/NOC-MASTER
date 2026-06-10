const REGION_CODE = '{{ region_code }}';
const SLA_BASE = { 'TX': 0.8667, 'AX': 175.2 };
let _datosSemanal = null;

function pad2(n) { return String(n).padStart(2, '0'); }
function fmtFecha(d) { return d.toISOString().slice(0, 10); }

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
    box.classList.remove('urgent', 'critical');
    if (diff < 86400000) box.classList.add('critical');
    else if (diff < 2 * 86400000) box.classList.add('urgent');
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

(function initFechas() {
    const hoy = new Date();
    const hace4sem = new Date(hoy);
    hace4sem.setDate(hoy.getDate() - 28);
    document.getElementById('fDesde').value = fmtFecha(hace4sem);
    document.getElementById('fHasta').value = fmtFecha(hoy);
})();

function classCelda(valor, slaBase) {
    if (!valor || valor === 0) return 'cell-vacio';
    if (valor < slaBase * 0.3) return 'cell-bajo';
    if (valor < slaBase * 0.7) return 'cell-medio';
    if (valor < slaBase) return 'cell-alto';
    return 'cell-rebasa';
}

function fmtNum(v) {
    if (!v || v === 0) return '—';
    return v.toFixed(2);
}

function renderTabla(data) {
    const wrap = document.getElementById('tablaSemanalWrap');
    if (!data.filas || !data.filas.length) {
        wrap.innerHTML = '<div class="no-data">📭 Sin datos para este período.</div>';
        return;
    }
    const tipoRed = document.getElementById('selTipoRed').value;
    const slaBase = SLA_BASE[tipoRed];

    let thead = '<tr><th class="col-nodo">📡 Nodo (' + data.filas.length + ')</th>';
    data.semanas.forEach(sem => { thead += '<th>' + sem + '</th>'; });
    thead += '<th class="col-total">TOTAL</th></tr>';

    let tbody = '';
    data.filas.forEach(fila => {
        let tr = '<tr><td class="cell-nodo">' + fila.nodo + '</td>';
        data.semanas.forEach(sem => {
            const v = fila.valores[sem] || 0;
            tr += '<td class="' + classCelda(v, slaBase) + '">' + fmtNum(v) + '</td>';
        });
        tr += '<td class="cell-total">' + fila.total.toFixed(2) + '</td></tr>';
        tbody += tr;
    });

    wrap.innerHTML = '<div class="tabla-wrap"><table class="tabla-pivot"><thead>' + thead + '</thead><tbody>' + tbody + '</tbody></table></div>';
}

async function cargarTabla() {
    document.getElementById('loader-overlay').classList.remove('hidden');
    const tipoRed = document.getElementById('selTipoRed').value;
    const fuente = document.getElementById('selFuente').value;
    const desde = document.getElementById('fDesde').value;
    const hasta = document.getElementById('fHasta').value;

    document.getElementById('slaTipo').textContent = tipoRed;
    document.getElementById('slaVal').textContent = SLA_BASE[tipoRed];

    const qs = 'region=' + REGION_CODE + '&tipoRed=' + tipoRed + '&fuente=' + fuente + '&desde=' + desde + '&hasta=' + hasta;
    try {
        const r = await fetch('/api/reporte-semanal/tabla?' + qs);
        const data = await r.json();
        if (data.error) {
            document.getElementById('tablaSemanalWrap').innerHTML = '<div class="no-data">⚠️ Error: ' + data.error + '</div>';
            return;
        }
        _datosSemanal = data;
        document.getElementById('subtitulo').textContent =
            'Vista ' + fuente + ' · Período: ' + data.periodo + ' · ' + data.total_nodos + ' nodos · ' + data.total_semanas + ' semanas';
        renderTabla(data);
    } catch (e) {
        document.getElementById('tablaSemanalWrap').innerHTML = '<div class="no-data">⚠️ Error: ' + e.message + '</div>';
    } finally {
        setTimeout(() => document.getElementById('loader-overlay').classList.add('hidden'), 300);
    }
}

window.addEventListener('DOMContentLoaded', () => { cargarTabla(); });