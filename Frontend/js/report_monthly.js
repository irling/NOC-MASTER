const REGION_CODE = '{{ region_code }}';
const SLA_BASE = { 'TX': 0.8667, 'AX': 175.2 };
let _datosMensual = null;

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

/* Default fechas: últimos 6 meses */
(function initFechas() {
    const hoy = new Date();
    const hace6meses = new Date(hoy.getFullYear(), hoy.getMonth() - 6, 1);
    document.getElementById('fDesde').value = fmtFecha(hace6meses);
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
    const wrap = document.getElementById('tablaMensualWrap');
    if (!data.filas || !data.filas.length) {
        wrap.innerHTML = '<div class="no-data">📭 Sin datos para este período.</div>';
        return;
    }
    const tipoRed = document.getElementById('selTipoRed').value;
    const slaBase = SLA_BASE[tipoRed];

    let thead = '<tr><th class="col-nodo">📡 Nodo (' + data.filas.length + ')</th>';
    for (let i = 0; i < data.meses.length; i++) {
        thead += '<th>' + data.meses_labels[i] + '</th>';
    }
    thead += '<th class="col-total">TOTAL</th></tr>';

    let tbody = '';
    data.filas.forEach(fila => {
        let tr = '<tr><td class="cell-nodo">' + fila.nodo + '</td>';
        data.meses.forEach(mes => {
            const v = fila.valores[mes] || 0;
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
        const r = await fetch('/api/reporte-mensual/tabla?' + qs);
        const data = await r.json();
        if (data.error) {
            document.getElementById('tablaMensualWrap').innerHTML = '<div class="no-data">⚠️ Error: ' + data.error + '</div>';
            return;
        }
        _datosMensual = data;
        document.getElementById('subtitulo').textContent =
            'Vista ' + fuente + ' · Período: ' + data.periodo + ' · ' + data.total_nodos + ' nodos · ' + data.total_meses + ' meses';
        renderTabla(data);
    } catch (e) {
        document.getElementById('tablaMensualWrap').innerHTML = '<div class="no-data">⚠️ Error: ' + e.message + '</div>';
    } finally {
        setTimeout(() => document.getElementById('loader-overlay').classList.add('hidden'), 300);
    }
}

function exportarExcel() {
    if (!_datosMensual) { alert('Aún no hay datos cargados'); return; }
    const tabla = document.querySelector('.tabla-pivot');
    if (!tabla) { alert('No hay tabla para exportar'); return; }
    const a = document.createElement('a');
    a.href = 'data:application/vnd.ms-excel,' + encodeURIComponent(tabla.outerHTML);
    a.download = 'OiM_Mensual_' + REGION_CODE + '_' + new Date().toISOString().slice(0, 10) + '.xls';
    a.click();
}

window.addEventListener('DOMContentLoaded', () => { cargarTabla(); });