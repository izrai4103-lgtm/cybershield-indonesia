async function loadReports() {
    const res = await fetch('/api/admin/reports');
    const reports = await res.json();
    const statsEl = document.getElementById('admin-stats');
    statsEl.className = 'result-box success';
    statsEl.innerHTML = 'Total Laporan: <strong style="color:#00ff9d">' + reports.length + '</strong>';
    const body = document.getElementById('reports-body');
    body.innerHTML = '';
    reports.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td>'+r.id+'</td><td>'+(r.number||'-')+'</td><td>'+(r.username||'-')+'</td><td>'+(r.category||'-')+'</td><td>'+(r.description||'-')+'</td><td>'+r.status+'</td><td><button onclick="updateStatus('+r.id+',\'verified\')">✓</button> <button onclick="updateStatus('+r.id+',\'rejected\')">✗</button></td>';
        body.appendChild(tr);
    });
}
async function updateStatus(id, status) {
    await fetch('/api/admin/report/'+id+'/'+status, {method:'POST'});
    loadReports();
}
loadReports();
setInterval(loadReports, 10000);
