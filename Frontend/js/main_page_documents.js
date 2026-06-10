const REGION_CODE = "{{ region_code }}";

/* ═════ HELPERS (declarar PRIMERO para evitar TDZ) ═════ */
function pad2(n) {
    return String(n).padStart(2, "0");
}

function rangoUltimaSemanaNOC() {
    const hoy = new Date();
    const dow = hoy.getDay();
    const fmt = (d) => d.toISOString().slice(0, 10);
    const juevesCierre = new Date(viernesPasado);
    const viernesPasado = new Date(hoy);

    let diasAtras;

    if (dow === 5) diasAtras = hoy.getHours() < 12 ? 7 : 0;
    else if (dow > 5) diasAtras = dow - 5;
    else diasAtras = dow + 2;
    diasAtras += 7;

    viernesPasado.setDate(hoy.getDate() - diasAtras);
    juevesCierre.setDate(viernesPasado.getDate() + 6);


    return { desde: fmt(viernesPasado), hasta: fmt(juevesCierre) };
}

/* ═════ DEADLINE GLOBAL ═════ */
function actualizarDeadline() {
    const box = document.getElementById("deadlineBar");
    const t = document.getElementById("deadlineTime");
    const ahora = new Date();
    const dow = ahora.getDay();
    const proxViernes = new Date(ahora);

    const dias = Math.floor(diff / 86400000);
    const hrs = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);

    let diasHasta;
    let diff = proxViernes - ahora;

    if (!box) return;
    
    if (dow < 5) diasHasta = 5 - dow;

    else if (dow === 5) diasHasta = ahora.getHours() < 12 ? 0 : 7;
    else diasHasta = 5 - dow + 7;
    
    proxViernes.setDate(ahora.getDate() + diasHasta);
    proxViernes.setHours(12, 0, 0, 0);
    
    if (diff < 0) {
        box.style.display = "none";
        return;
    }
    box.style.display = "flex";
    box.classList.remove("urgent", "critical");
    
    if (diff < 86400000) box.classList.add("critical");
    else if (diff < 2 * 86400000) box.classList.add("urgent");
    if (dias > 0)
        t.textContent = dias + "d " + pad2(hrs) + "h " + pad2(mins) + "m";
    else t.textContent = pad2(hrs) + ":" + pad2(mins) + ":" + pad2(secs) + " ⚠️";
}

/* ═════ RELOJ ═════ */
function updateClock() {
    document.getElementById("clock").textContent = new Date().toLocaleTimeString(
        "es-PE",
        { hour12: false },
    );
}

/* ═════ SELECTOR AÑO-MES ═════ */
function populateMonths() {
    const sel = document.getElementById("selAnioMes");
    const mn = [
        "Enero",
        "Febrero",
        "Marzo",
        "Abril",
        "Mayo",
        "Junio",
        "Julio",
        "Agosto",
        "Septiembre",
        "Octubre",
        "Noviembre",
        "Diciembre",
    ];
    let opciones = '<option value="SEMANA">Última semana OiM</option>';
    let y = new Date().getFullYear(),
        m = new Date().getMonth() + 1;
    while (y > 2025 || (y === 2025 && m >= 8)) {
        opciones +=
            '<option value="' +
            y +
            "-" +
            pad2(m) +
            '">' +
            y +
            " - " +
            mn[m - 1] +
            "</option>";
        m--;
        if (m === 0) {
            m = 12;
            y--;
        }
    }
    opciones += '<option value="TODOS">Todos los registros</option>';
    // Desactivar onchange durante setup
    const _onch = sel.onchange;
    sel.onchange = null;
    sel.innerHTML = opciones;
    sel.value = "SEMANA";
    sel.onchange = _onch;
    // Auto-llenar Desde/Hasta
    const r = rangoUltimaSemanaNOC();
    document.getElementById("dateDesde").value = r.desde;
    document.getElementById("dateHasta").value = r.hasta;
}

function onCambioAnioMes() {
    const sel = document.getElementById("selAnioMes");
    const v = sel.value;
    if (v === "SEMANA") {
        const r = rangoUltimaSemanaNOC();
        document.getElementById("dateDesde").value = r.desde;
        document.getElementById("dateHasta").value = r.hasta;
    } else if (v === "TODOS") {
        document.getElementById("dateDesde").value = "";
        document.getElementById("dateHasta").value = "";
    } else if (v && v.match(/^\d{4}-\d{2}$/)) {
        const parts = v.split("-").map(Number);
        const yy = parts[0],
            mm = parts[1];
        const ini = new Date(yy, mm - 1, 1);
        const fin = new Date(yy, mm, 0);
        const fmt = (d) => d.toISOString().slice(0, 10);
        document.getElementById("dateDesde").value = fmt(ini);
        document.getElementById("dateHasta").value = fmt(fin);
    }
    runAnalysis();
}

/* ═════ ANÁLISIS PRINCIPAL ═════ */
async function runAnalysis() {
    document.getElementById("loadingOverlay").style.display = "flex";
    try {
        const tRed = document.getElementById("selTipoRed").value;
        const fIni = document.getElementById("dateDesde").value;
        const fFin = document.getElementById("dateHasta").value;
        let url =
            "/api/noc-master/datos?region=" + REGION_CODE + "&tipoRed=" + tRed;
        if (fIni) url += "&fechaInicio=" + fIni;
        if (fFin) url += "&fechaFin=" + fFin;
        const res = await fetch(url);
        const data = await res.json();
        if (data.error) {
            console.error(data.error);
            return;
        }
        const just = data.justificados || {};
        buildTscCards(just.tableData || {});
        buildPivotTable(just);
        await loadQualityAlerts();
    } catch (e) {
        console.error(e);
    } finally {
        document.getElementById("loadingOverlay").style.display = "none";
    }
}

function buildTscCards(tableData) {
    const totals = {};
    let grand = 0;
    Object.values(tableData).forEach((w) => {
        Object.entries(w.motivos || {}).forEach(([mot, d]) => {
            const t = (d.DONE || 0) + (d.ONGOING || 0) + (d.PENDING || 0);
            totals[mot] = (totals[mot] || 0) + t;
            grand += t;
        });
    });
    const colors = ["c0", "c1", "c2", "c3", "c4", "c5", "c6", "c7"];
    const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    let html = sorted
        .map(
            ([mot, tot], i) =>
                '<div class="tsc-card ' +
                colors[i % 8] +
                '"><div class="tsc-label">' +
                mot +
                '</div><div class="tsc-val">' +
                tot +
                '</div><div class="tsc-sub">eventos OK</div></div>',
        )
        .join("");
    html +=
        '<div class="tsc-card total-card"><div class="tsc-label"><i class="fas fa-sigma"></i> Total General</div><div class="tsc-val" style="color:var(--blue);">' +
        grand +
        '</div><div class="tsc-sub">suma del mes</div></div>';
    document.getElementById("tscCards").innerHTML =
        html ||
        '<div class="tsc-card c0"><div class="tsc-label">Sin datos</div><div class="tsc-val">0</div></div>';
}

async function loadQualityAlerts() {
    try {
        const tRed = document.getElementById("selTipoRed").value;
        const res = await fetch(
            "/api/noc-master/calidad?region=" + REGION_CODE + "&tipoRed=" + tRed,
        );
        const data = await res.json();
        renderAlerts(data);
    } catch (e) {
        console.error(e);
    }
}

function renderAlerts(data) {
    const counter = document.getElementById("alertCounter");
    const list = document.getElementById("alertList");
    const dupOK = data.duplicidad_ok || [];
    const sinOK = data.yofc_sin_ok || [];
    const sinSync = data.meses_sin_sync || [];
    const total = dupOK.length + sinOK.length + sinSync.length;
    counter.innerHTML =
        '<div class="alert-chip red"><span class="alert-dot"></span>' +
        dupOK.length +
        ' Dup. OK</div><div class="alert-chip yellow">' +
        sinOK.length +
        ' Sin OK</div><div class="alert-chip gray">' +
        sinSync.length +
        " Sin Sync</div>";
    if (!total) {
        list.innerHTML =
            '<div class="alert-none"><i class="fas fa-check-circle" style="color:var(--green);margin-right:5px;"></i>Data 100% consistente</div>';
        return;
    }
    let html = "";
    dupOK.forEach((a) => {
        const s =
            (a.sitios || []).slice(0, 5).join(", ") +
            (a.sitios.length > 5 ? " +" + (a.sitios.length - 5) + " más" : "");
        html +=
            '<div class="alert-item red"><strong>🔴 Duplicidad OK — ' +
            a.codigo_informe +
            "</strong>Tiene <strong>" +
            a.cantidad +
            ' registros OK</strong> — debe ser solo 1.<div class="alert-sites">' +
            s +
            "</div></div>";
    });
    sinOK.forEach((a) => {
        const s =
            (a.sitios || []).slice(0, 5).join(", ") +
            (a.sitios.length > 5 ? " +" + (a.sitios.length - 5) + " más" : "");
        html +=
            '<div class="alert-item yellow"><strong>🟡 Sin OK — ' +
            a.codigo_informe +
            "</strong><strong>" +
            a.total_filas +
            '</strong> filas con código YOFC pero ningún PRIMARY=OK.<div class="alert-sites">' +
            s +
            "</div></div>";
    });
    sinSync.forEach((m) => {
        html +=
            '<div class="alert-item gray"><strong>⚪ Sin sincronizar — ' +
            m.region +
            " " +
            m.mes +
            "</strong>Hoja 1 no tiene ningún dato en este período.</div>";
    });
    list.innerHTML = html;
}

function toggleDetails(id) {
    const r = document.getElementById(id),
        ic = document.getElementById("icon-" + id);
    const open = r.style.display === "table-row";
    r.style.display = open ? "none" : "table-row";
    ic.classList.toggle("open", !open);
}

function buildPivotTable(justData) {
    const body = document.getElementById("matrixBody");
    const tableData = justData.tableData || {};
    const detalles = justData.detalles || [];
    const semanas = Object.keys(tableData).sort((a, b) => Number(a) - Number(b));
    if (!semanas.length) {
        body.innerHTML =
            '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--muted);">No hay registros con PRIMARY=OK en el rango seleccionado.</td></tr>';
        return;
    }
    let html = "";
    semanas.forEach((week) => {
        const motivos = tableData[week].motivos || {};
        Object.keys(motivos)
            .sort()
            .forEach((motivo) => {
                const d = motivos[motivo];
                const done = d.DONE || 0,
                    ongo = d.ONGOING || 0,
                    pend = d.PENDING || 0;
                const totOK = done + ongo,
                    sum = done + ongo + pend;
                const rowId = "det-" + week + "-" + motivo.replace(/\W/g, "-");
                const events = detalles.filter(
                    (x) => x.semana === week && x.motivo === motivo,
                );
                const isBad = motivo === "SIN CLASIFICAR";
                const stD =
                    done > 0 ? "color:var(--green);font-weight:700;" : "color:#cbd5e0;";
                const stO =
                    ongo > 0 ? "color:var(--yellow);font-weight:700;" : "color:#cbd5e0;";
                const stP =
                    pend > 0 ? "color:var(--pink);font-weight:700;" : "color:#cbd5e0;";
                const subRows = events
                    .map((ev) => {
                        const estColor =
                            ev.estado === "DONE"
                                ? "var(--green)"
                                : ev.estado === "ONGOING"
                                    ? "#b45309"
                                    : "var(--pink)";
                        const estHtml = ev.estado
                            ? '<span style="font-weight:600;color:' +
                            estColor +
                            '">' +
                            ev.estado +
                            "</span>"
                            : '<span style="color:var(--pink);font-weight:700;">⚠ VACÍO</span>';
                        const infHtml = ev.informe
                            ? '<span style="font-family:var(--mono);color:var(--blue);">' +
                            ev.informe +
                            "</span>"
                            : '<span style="color:var(--pink);">⚠ Sin informe</span>';
                        const motHtml = isBad
                            ? '<span style="color:var(--pink);"><i class="fas fa-triangle-exclamation"></i> Analista no llenó Motivo TSC</span>'
                            : ev.motivo_real || "—";
                        return (
                            '<tr><td style="font-family:var(--mono);color:var(--blue);font-weight:600;">' +
                            (ev.site_id || "") +
                            "</td><td>" +
                            (ev.site || "—") +
                            '</td><td style="font-family:var(--mono);">' +
                            (ev.fecha || "—") +
                            "</td><td>" +
                            estHtml +
                            "</td><td>" +
                            infHtml +
                            "</td><td>" +
                            motHtml +
                            '</td><td style="font-family:var(--mono);color:var(--blue);">' +
                            (ev.ticket || "—") +
                            "</td></tr>"
                        );
                    })
                    .join("");
                const motColor = isBad ? "var(--pink)" : "inherit";
                html +=
                    '<tr class="row-parent" style="cursor:pointer;" onclick="toggleDetails(\'' +
                    rowId +
                    '\')"><td><i class="fas fa-chevron-right chevron" id="icon-' +
                    rowId +
                    '"></i><span class="week-badge">W' +
                    week +
                    '</span></td><td style="font-weight:700;color:' +
                    motColor +
                    '">' +
                    motivo +
                    '</td><td class="num-cell" style="' +
                    stD +
                    '">' +
                    done +
                    '</td><td class="num-cell" style="' +
                    stO +
                    '">' +
                    ongo +
                    '</td><td class="num-cell" style="' +
                    stP +
                    '">' +
                    pend +
                    '</td><td class="num-cell" style="color:var(--blue);font-weight:700;">' +
                    totOK +
                    '</td><td class="num-cell" style="font-weight:800;background:#f8fafc;">' +
                    sum +
                    '</td></tr><tr id="' +
                    rowId +
                    '" style="display:none;background:var(--blue-l);"><td colspan="7" style="padding:10px 28px;border-bottom:2px solid var(--blue);"><table class="nested-table"><thead><tr><th>Site ID</th><th>Sitio</th><th>Fecha</th><th>Estado</th><th>Código Informe</th><th>Motivo Real</th><th>Ticket</th></tr></thead><tbody>' +
                    subRows +
                    "</tbody></table></td></tr>";
            });
    });
    body.innerHTML = html;
}

function exportExcel() {
    const a = document.createElement("a");
    a.href =
        "data:application/vnd.ms-excel," +
        encodeURIComponent(document.getElementById("matrixTable").outerHTML);
    a.download = "YOFC_Avance_Documentos_" + REGION_CODE + ".xls";
    a.click();
}

/* ═════ SISTEMA DE ALERTAS YOFC ═════ */
let _alertasYofcData = null;
let _alertasYofcPaused = false;

async function cargarAlertasYofc() {
    try {
        const r = await fetch("/api/alertas-yofc?region=" + REGION_CODE);
        const data = await r.json();
        if (data.error) {
            console.error("alertas-yofc:", data.error);
            return;
        }
        _alertasYofcData = data;
        renderBannerYofc(data);
        const sesKey =
            "yofc_visto_" + REGION_CODE + "_" + new Date().toISOString().slice(0, 10);
        if (
            data.criticas > 0 &&
            !_alertasYofcPaused &&
            !sessionStorage.getItem(sesKey)
        ) {
            abrirModalAlertasYofc();
            sessionStorage.setItem(sesKey, "1");
        }
    } catch (e) {
        console.error(e);
    }
}

function renderBannerYofc(data) {
    const banner = document.getElementById("yofc-banner");
    const txt = document.getElementById("yofcBannerText");
    if (!banner || !txt) return;
    if (!data.alertas || !data.alertas.length) {
        banner.classList.remove("show");
        return;
    }
    if (sessionStorage.getItem("yofc_banner_closed_" + REGION_CODE) === "1")
        return;
    const parts = data.alertas
        .slice(0, 30)
        .map((a) => {
            const tag =
                a.severidad === "critica" ? "🔴" : a.severidad === "alta" ? "🟠" : "🟡";
            const cls = a.severidad === "critica" ? "critica" : "";
            return (
                '<span class="' +
                cls +
                '">' +
                tag +
                " " +
                a.codigo_informe +
                " (" +
                a.dias_habiles +
                " días hábiles vencidos)</span>"
            );
        })
        .join("");
    txt.innerHTML = parts + parts;
    banner.classList.add("show");
}

function cerrarBannerYofc() {
    document.getElementById("yofc-banner").classList.remove("show");
    sessionStorage.setItem("yofc_banner_closed_" + REGION_CODE, "1");
}

function abrirModalAlertasYofc() {
    if (!_alertasYofcData) return;
    const modal = document.getElementById("modalAlertasYofc");
    modal.classList.add("show");
    modal.style.display = "flex";
    const summary = document.getElementById("malYofcSummary");
    const lista = document.getElementById("malYofcLista");
    summary.innerHTML =
        '<span class="mal-yofc-chip crit">' +
        _alertasYofcData.criticas +
        ' críticas (≥10 días)</span><span class="mal-yofc-chip alta">' +
        _alertasYofcData.altas +
        ' altas (7-9 días)</span><span class="mal-yofc-chip media">' +
        _alertasYofcData.medias +
        " medias (4-6 días)</span>";
    if (!_alertasYofcData.alertas.length) {
        lista.innerHTML =
            '<div style="text-align:center;padding:30px;color:#666;">No hay códigos pendientes.</div>';
        return;
    }
    lista.innerHTML = _alertasYofcData.alertas
        .map(
            (a) =>
                '<div class="alerta-yofc-item ' +
                a.severidad +
                '"><div class="alerta-yofc-info"><div class="alerta-yofc-codigo">' +
                a.codigo_informe +
                '</div><div class="alerta-yofc-meta">' +
                a.region +
                " · " +
                a.sistema +
                " · " +
                (a.site || "—") +
                "<br>Evento terminó: <strong>" +
                a.fecha_evento +
                "</strong> · Status: <strong>" +
                a.status +
                '</strong></div></div><div class="alerta-yofc-dias">' +
                a.dias_habiles +
                "d</div></div>",
        )
        .join("");
}

function cerrarModalAlertasYofc() {
    const modal = document.getElementById("modalAlertasYofc");
    modal.classList.remove("show");
    modal.style.display = "none";
}

function recordarAlertasYofc() {
    cerrarModalAlertasYofc();
    _alertasYofcPaused = true;
    setTimeout(
        () => {
            _alertasYofcPaused = false;
        },
        5 * 60 * 1000,
    );
}

/* ═════ INICIALIZACIÓN (al final, todo declarado antes) ═════ */
const regTab = document.querySelector(".id-reg-" + REGION_CODE);
if (regTab) regTab.classList.add("active");

setInterval(updateClock, 1000);
updateClock();
setInterval(actualizarDeadline, 1000);
actualizarDeadline();

populateMonths();
runAnalysis();

cargarAlertasYofc();
setInterval(cargarAlertasYofc, 5 * 60 * 1000);

function toggleVistaMenu() {
    const m = document.getElementById("vistaMenu");
    if (m) m.classList.toggle("show");
}
document.addEventListener("click", (e) => {
    const dd = document.getElementById("vistaDropdown");
    const m = document.getElementById("vistaMenu");
    if (dd && m && !dd.contains(e.target)) m.classList.remove("show");
});
