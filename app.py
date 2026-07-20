import os
from flask import Flask, render_template, request, jsonify, Response, send_from_directory, stream_with_context
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import phonenumbers, json, re, socket, subprocess, sqlite3, threading, time
from phonenumbers import carrier, geocoder, timezone
from datetime import datetime
import whois as whois_lib
import folium
from io import BytesIO

app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')
DB = "/root/Documents/Codex/2026-07-20/new-chat-2/cyber-shield/cybershield.db"

def init_db():
    conn = sqlite3.connect(DB); c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY AUTOINCREMENT, number TEXT, email TEXT, username TEXT, domain TEXT, category TEXT, description TEXT, reporter_ip TEXT, lat REAL DEFAULT 0, lng REAL DEFAULT 0, auto_scan TEXT DEFAULT '{}', status TEXT DEFAULT 'pending', created_at TEXT)''')
    c.execute('''CREATE TABLE IF NOT EXISTS checks (id INTEGER PRIMARY KEY AUTOINCREMENT, target_type TEXT, target_value TEXT, result TEXT, created_at TEXT)''')
    conn.commit(); conn.close()

init_db()

# SSE clients
sse_clients = []

def db_query(q, p=()):
    conn = sqlite3.connect(DB); conn.row_factory = sqlite3.Row
    c = conn.cursor(); c.execute(q, p); rows = c.fetchall(); conn.close()
    return [dict(r) for r in rows]

def db_exec(q, p=()):
    conn = sqlite3.connect(DB); c = conn.cursor(); c.execute(q, p); conn.commit(); conn.close()

def broadcast_all():
    total_reports = len(db_query("SELECT * FROM reports"))
    total_checks = len(db_query("SELECT * FROM checks"))
    by_cat = db_query("SELECT category, COUNT(*) as c FROM reports GROUP BY category")
    recent = db_query("SELECT * FROM reports ORDER BY created_at DESC LIMIT 20")
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    payload = json.dumps({
        "scam_numbers_reported": total_reports, "total_checks": total_checks,
        "by_category": by_cat,
        "recent_reports": [{
            "id": r['id'],
            "number": (r['number'][:4]+'****'+r['number'][-2:] if r['number'] and len(r['number'])>6 else r['number'] or '—'),
            "username": r['username'],
            "category": r['category'],
            "description": r['description'][:80] if r['description'] else '',
            "lat": r['lat'], "lng": r['lng'],
            "created_at": r['created_at'][:19]
        } for r in recent],
        "server_time": now
    })
    # SSE push
    for q in sse_clients:
        q.put(payload)
    socketio.emit('stats_update', json.loads(payload))
    return json.loads(payload)

def auto_scan_number(number):
    try:
        parsed = phonenumbers.parse(number, "ID")
        region = geocoder.description_for_number(parsed, "id") or "Unknown"
        provider = carrier.name_for_number(parsed, "id") or "Unknown"
        return {"region": region, "provider": provider, "valid": phonenumbers.is_valid_number(parsed)}
    except:
        return {"error": "invalid"}

# ===================== ROUTES =====================
@app.route('/')
def index(): return render_template('index.html')
@app.route('/admin')
def admin(): return render_template('admin.html')
@app.route('/static/<path:p>')
def static_files(p): return send_from_directory('static', p)

@app.route('/api/phone', methods=['POST'])
def api_phone():
    data = request.get_json(); number = data.get('number','')
    try:
        parsed = phonenumbers.parse(number, "ID")
        if not phonenumbers.is_valid_number(parsed):
            return jsonify({"error": "Nomor tidak valid"})
        region = geocoder.description_for_number(parsed, "id") or "Tidak diketahui"
        provider = carrier.name_for_number(parsed, "id") or "Tidak diketahui"
        tz = timezone.time_zones_for_number(parsed)
        e164 = phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
        ntype = {0:"Fixed Line",1:"Mobile",2:"Fixed Line/Mobile",3:"Toll Free",4:"Premium Rate",5:"Shared Cost",6:"VoIP",7:"Personal Number",8:"Pager",9:"Universal",10:"Unknown"}.get(phonenumbers.number_type(parsed),"Unknown")
        existing = db_query("SELECT COUNT(*) as c FROM reports WHERE number=?", (e164,))
        result = {"valid":True,"international":phonenumbers.format_number(parsed,phonenumbers.PhoneNumberFormat.INTERNATIONAL),"national":phonenumbers.format_number(parsed,phonenumbers.PhoneNumberFormat.NATIONAL),"e164":e164,"region":region,"provider":provider,"timezone":", ".join(tz) if tz else "Tidak diketahui","type":ntype,"country_code":parsed.country_code,"national_number":parsed.national_number,"scam_reported":existing[0]['c']>0,"scam_reports_count":existing[0]['c']}
        db_exec("INSERT INTO checks (target_type,target_value,result,created_at) VALUES (?,?,?,?)",("phone",e164,json.dumps(result),datetime.now().isoformat()))
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)})

@app.route('/api/ip', methods=['POST'])
def api_ip():
    data = request.get_json(); target = data.get('target','')
    try:
        if not re.match(r'^\d+\.\d+\.\d+\.\d+$', target):
            ip = socket.gethostbyname(target); hostname = target
        else:
            ip = target
            try: hostname = socket.gethostbyaddr(ip)[0]
            except: hostname = "Tidak dapat resolve"
        return jsonify({"ip": ip, "hostname": hostname})
    except Exception as e:
        return jsonify({"error": str(e)})

@app.route('/api/whois', methods=['POST'])
def api_whois():
    data = request.get_json(); domain = data.get('domain','')
    try:
        w = whois_lib.whois(domain)
        def fmt(d):
            if isinstance(d, list): return str(d[0]) if d else "Tidak diketahui"
            return str(d) if d else "Tidak diketahui"
        return jsonify({"domain":domain,"registrar":fmt(w.registrar),"creation_date":fmt(w.creation_date),"expiration_date":fmt(w.expiration_date),"name_servers":w.name_servers if w.name_servers else [],"org":fmt(w.org),"country":fmt(w.country)})
    except Exception as e:
        return jsonify({"error": str(e)})

@app.route('/api/username', methods=['POST'])
def api_username():
    data = request.get_json(); username = data.get('username','')
    sites = {"Instagram":f"https://instagram.com/{username}","X":f"https://x.com/{username}","TikTok":f"https://tiktok.com/@{username}","Facebook":f"https://facebook.com/{username}","YT":f"https://youtube.com/@{username}","LinkedIn":f"https://linkedin.com/in/{username}","GitHub":f"https://github.com/{username}","Telegram":f"https://t.me/{username}","Reddit":f"https://reddit.com/user/{username}","Threads":f"https://threads.net/@{username}"}
    results = []
    for name, url in sites.items():
        try:
            r = subprocess.run(["curl","-s","-o","/dev/null","-w","%{http_code}","-I","-m","8",url],capture_output=True,text=True,timeout=10)
            code = r.stdout.strip(); found = code in ("200","302","301")
            results.append({"site":name,"url":url,"status":"FOUND" if found else "NOT FOUND","code":code})
        except:
            results.append({"site":name,"url":url,"status":"ERROR"})
    return jsonify(results)

@app.route('/api/email', methods=['POST'])
def api_email():
    data = request.get_json(); email = data.get('email','')
    try:
        result = subprocess.run(["holehe",email,"--only-used","--no-color"],capture_output=True,text=True,timeout=120)
        accounts = []
        for line in result.stdout.split('\n'):
            if ']' in line and '[' in line:
                parts = line.strip().split()
                if len(parts) >= 2: accounts.append(parts[-1].strip('[]'))
        return jsonify({"email":email,"accounts_found":accounts,"total":len(accounts)})
    except Exception as e:
        return jsonify({"error": str(e)})

@app.route('/api/report-scam', methods=['POST'])
def report_scam():
    data = request.get_json()
    number = data.get('number','')
    # Auto-scan reported number for region
    lat, lng = 0, 0
    auto_scan = {}
    if number:
        scan = auto_scan_number(number)
        auto_scan = scan
    db_exec("""INSERT INTO reports (number,email,username,domain,category,description,reporter_ip,lat,lng,auto_scan,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (number,data.get('email',''),data.get('username',''),data.get('domain',''),data.get('category','Lainnya'),data.get('description',''),request.remote_addr,lat,lng,json.dumps(auto_scan),'pending',datetime.now().isoformat()))
    payload = broadcast_all()
    socketio.emit('new_report', {"number":payload['recent_reports'][0]['number'] if payload['recent_reports'] else '','category':data.get('category','')})
    return jsonify({"status":"ok","message":"Laporan diterima! Real-time broadcast aktif.","total_reports":payload['scam_numbers_reported']})

@app.route('/api/stats', methods=['GET'])
def stats():
    return jsonify(broadcast_all())

@app.route('/api/map', methods=['GET'])
def api_map():
    reports = db_query("SELECT * FROM reports ORDER BY created_at DESC LIMIT 50")
    m = folium.Map(location=[-2.5, 118], zoom_start=5, tiles='CartoDB dark')
    for r in reports:
        folium.Marker([r['lat'] if r['lat'] else -2.5, r['lng'] if r['lng'] else 118],
                      popup=f"{r['category']}: {r['number'] or r['username'] or r['email'] or '—'}<br>{r['created_at'][:19]}",
                      icon=folium.Icon(color='red' if r['category']=='Pelecehan Seksual' else 'orange')).add_to(m)
    return m._repr_html_()

@app.route('/api/events', methods=['GET'])
def sse_events():
    def event_stream():
        q = __import__('queue').Queue()
        sse_clients.append(q)
        try:
            while True:
                data = q.get()
                yield f"data: {data}\n\n"
        except GeneratorExit:
            sse_clients.remove(q)
    return Response(event_stream(), mimetype="text/event-stream")

@app.route('/api/admin/reports', methods=['GET'])
def admin_reports():
    return jsonify(db_query("SELECT * FROM reports ORDER BY created_at DESC LIMIT 100"))

@app.route('/api/admin/report/<int:rid>/<status>', methods=['POST'])
def update_report(rid, status):
    db_exec("UPDATE reports SET status=? WHERE id=?",(status,rid))
    broadcast_all()
    return jsonify({"ok":True})

@socketio.on('connect')
def on_connect():
    emit('stats_update', broadcast_all())

@socketio.on('request_notify')
def handle_notify(data):
    socketio.emit('notify', data)

if __name__ == '__main__':
    socketio.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=False, allow_unsafe_werkzeug=True)
