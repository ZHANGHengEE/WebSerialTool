const els = {
  supportBadge: document.getElementById('supportBadge'),
  connBadge: document.getElementById('connBadge'),

  baudRate: document.getElementById('baudRate'),
  customBaud: document.getElementById('customBaud'),
  dataBits: document.getElementById('dataBits'),
  stopBits: document.getElementById('stopBits'),
  parity: document.getElementById('parity'),
  flowControl: document.getElementById('flowControl'),
  lineEnding: document.getElementById('lineEnding'),

  connectBtn: document.getElementById('connectBtn'),
  disconnectBtn: document.getElementById('disconnectBtn'),
  reconnectBtn: document.getElementById('reconnectBtn'),

  parserEnabled: document.getElementById('parserEnabled'),
  showParserPanel: document.getElementById('showParserPanel'),
  parserPanel: document.getElementById('parserPanel'),
  parserStatus: document.getElementById('parserStatus'),

  showTimestamp: document.getElementById('showTimestamp'),
  autoScroll: document.getElementById('autoScroll'),
  hexReceive: document.getElementById('hexReceive'),
  hexSend: document.getElementById('hexSend'),
  clearLogBtn: document.getElementById('clearLogBtn'),
  downloadLogBtn: document.getElementById('downloadLogBtn'),

  stats: document.getElementById('stats'),
  log: document.getElementById('log'),

  sendInput: document.getElementById('sendInput'),
  sendBtn: document.getElementById('sendBtn'),
  sendClearBtn: document.getElementById('sendClearBtn'),

  gpsType: document.getElementById('gpsType'),
  gpsTime: document.getElementById('gpsTime'),
  gpsDate: document.getElementById('gpsDate'),
  gpsStatus: document.getElementById('gpsStatus'),
  gpsMode: document.getElementById('gpsMode'),
  gpsLat: document.getElementById('gpsLat'),
  gpsLon: document.getElementById('gpsLon'),
  gpsDecimal: document.getElementById('gpsDecimal'),
  gpsSpeedKnots: document.getElementById('gpsSpeedKnots'),
  gpsSpeedKmh: document.getElementById('gpsSpeedKmh'),
  gpsCourse: document.getElementById('gpsCourse'),
  parserTableBody: document.getElementById('parserTableBody')
};

let port = null;
let reader = null;
let writer = null;
let readLoopActive = false;
let textDecoder = new TextDecoder();
let textEncoder = new TextEncoder();
let rxBytes = 0;
let txBytes = 0;
let rawLogLines = [];
let textBuffer = '';
let parserHistory = [];



let isReconnectingByConfig = false;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fullyCloseCurrentPort(keepPortReference = true) {
  const currentPort = port;
  readLoopActive = false;

  try { if (reader) await reader.cancel(); } catch (_) {}
  try { if (reader) reader.releaseLock(); } catch (_) {}
  reader = null;

  try { if (writer) writer.releaseLock(); } catch (_) {}
  writer = null;

  try { if (currentPort) await currentPort.close(); } catch (_) {}

  if (!keepPortReference) {
    port = null;
  }
  setConn(false);
}

async function reopenPortWithCurrentSettings() {
  if (!port || isReconnectingByConfig) return;
  isReconnectingByConfig = true;

  const currentPort = port;
  const newBaud = effectiveBaudRate();
  appendLog('sys', `检测到串口参数变更，正在断开并按新波特率 ${newBaud} 自动重连...`);

  try {
    await fullyCloseCurrentPort(true);
    await sleep(120);
    port = currentPort;
    await openPort(currentPort);
  } catch (err) {
    appendLog('sys', `自动重连失败：${err.message || err}`);
    setConn(false);
  } finally {
    isReconnectingByConfig = false;
  }
}

function setupAutoReconnectOnBaudChange() {
  const handler = async () => {
    if (port) {
      await reopenPortWithCurrentSettings();
    }
  };

  els.baudRate.addEventListener('change', handler);
  els.customBaud.addEventListener('change', handler);
  els.customBaud.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && port) {
      await reopenPortWithCurrentSettings();
    }
  });
}



function nowStamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${ms}`;
}

function appendLog(type, text) {
  const prefix = els.showTimestamp.checked ? `[${nowStamp()}] ` : '';
  const line = `${prefix}${text}`;
  rawLogLines.push(line);
  if (rawLogLines.length > 10000) rawLogLines.shift();

  const span = document.createElement('span');
  span.className = type === 'rx' ? 'log-rx' : type === 'tx' ? 'log-tx' : 'log-sys';
  span.textContent = line + '\n';
  els.log.appendChild(span);

  if (els.log.childNodes.length > 10000) {
    els.log.removeChild(els.log.firstChild);
  }

  if (els.autoScroll.checked) {
    els.log.scrollTop = els.log.scrollHeight;
  }
}

function updateStats() {
  els.stats.textContent = `RX ${rxBytes} B · TX ${txBytes} B`;
}

function setConn(connected) {
  els.connBadge.textContent = connected ? '已连接' : '未连接';
  els.connBadge.className = `badge ${connected ? 'badge-on' : 'badge-off'}`;
}

function setSupportStatus() {
  const ok = 'serial' in navigator;
  els.supportBadge.textContent = ok ? '支持 Web Serial' : '当前浏览器不支持';
  els.supportBadge.className = `badge ${ok ? 'badge-on' : 'badge-off'}`;
  return ok;
}

function effectiveBaudRate() {
  const custom = Number(els.customBaud.value.trim());
  if (Number.isFinite(custom) && custom > 0) return custom;
  return Number(els.baudRate.value);
}

function toHexString(uint8arr) {
  return Array.from(uint8arr).map(v => v.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

function parseHexInput(text) {
  const clean = text.replace(/0x/gi, ' ').replace(/[^0-9a-fA-F]/g, ' ').trim();
  if (!clean) return new Uint8Array();
  const bytes = clean.split(/\s+/).map(v => {
    const n = parseInt(v, 16);
    if (!Number.isFinite(n) || n < 0 || n > 255) throw new Error(`非法HEX字节: ${v}`);
    return n;
  });
  return new Uint8Array(bytes);
}

async function openPort(selectedPort) {
  port = selectedPort || port;
  if (!port) throw new Error('未选择串口');

  const options = {
    baudRate: effectiveBaudRate(),
    dataBits: Number(els.dataBits.value),
    stopBits: Number(els.stopBits.value),
    parity: els.parity.value,
    flowControl: els.flowControl.value
  };

  await port.open(options);
  appendLog('sys', `串口已打开：baud=${options.baudRate}, dataBits=${options.dataBits}, stopBits=${options.stopBits}, parity=${options.parity}, flowControl=${options.flowControl}`);
  setConn(true);
  writer = port.writable.getWriter();
  startReadLoop();
}

async function requestAndConnect() {
  if (!setSupportStatus()) {
    appendLog('sys', '当前浏览器不支持 Web Serial API。请使用 Chrome / Edge。');
    return;
  }
  try {
    const selected = await navigator.serial.requestPort();
    await openPort(selected);
  } catch (err) {
    appendLog('sys', `连接失败：${err.message || err}`);
  }
}

async function reconnectGrantedPort() {
  if (!setSupportStatus()) return;
  try {
    const ports = await navigator.serial.getPorts();
    if (!ports.length) {
      appendLog('sys', '没有已授权串口，请先点击“连接串口”进行授权。');
      return;
    }
    await openPort(ports[0]);
  } catch (err) {
    appendLog('sys', `重连失败：${err.message || err}`);
  }
}

async function closePort() {
  await fullyCloseCurrentPort(false);
  appendLog('sys', '串口已断开');
}

async function startReadLoop() {
  if (!port?.readable || readLoopActive) return;
  readLoopActive = true;

  while (port && port.readable && readLoopActive) {
    try {
      reader = port.readable.getReader();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;

        rxBytes += value.byteLength;
        updateStats();

        if (els.hexReceive.checked) {
          appendLog('rx', `[RX] ${toHexString(value)}`);
        } else {
          const chunk = textDecoder.decode(value, { stream: true });
          appendLog('rx', `[RX] ${chunk.replace(/\r/g, '\\r').replace(/\n/g, '\n')}`);
          consumeTextChunk(chunk);
        }
      }
    } catch (err) {
      appendLog('sys', `读取异常：${err.message || err}`);
      break;
    } finally {
      try { if (reader) reader.releaseLock(); } catch (_) {}
      reader = null;
    }
  }

  if (port) {
    try { await closePort(); } catch (_) {}
  }
}

function consumeTextChunk(chunk) {
  textBuffer += chunk;
  const parts = textBuffer.split(/\r\n|\n|\r/);
  textBuffer = parts.pop() ?? '';
  for (const line of parts) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    handleIncomingLine(trimmed);
    tryUpdateMap(trimmed);
  }
}

function handleIncomingLine(line) {
  if (!els.parserEnabled.checked) return;
  const parsed = parseRmcSentence(line);
  if (parsed) updateParserUI(parsed);
}

function parseRmcSentence(sentence) {
  const m = sentence.match(/^\$(GP|GN|BD)RMC,([^*]+)(?:\*[0-9A-Fa-f]{2})?$/);
  if (!m) return null;
  const type = `${m[1]}RMC`;
  const fields = m[2].split(',');

  const utcRaw = fields[0] || '';
  const status = fields[1] || '';
  const latRaw = fields[2] || '';
  const latDir = fields[3] || '';
  const lonRaw = fields[4] || '';
  const lonDir = fields[5] || '';
  const speedKnots = fields[6] || '';
  const course = fields[7] || '';
  const dateRaw = fields[8] || '';
  const magneticVariation = fields[9] || '';
  const magneticDir = fields[10] || '';
  const mode = fields[11] || '';

  const latDecimal = nmeaToDecimal(latRaw, latDir, true);
  const lonDecimal = nmeaToDecimal(lonRaw, lonDir, false);
  const knotsVal = Number(speedKnots || 0);
  const kmhVal = Number.isFinite(knotsVal) ? knotsVal * 1.852 : NaN;

  return {
    type,
    utcRaw,
    utcDisplay: formatUtcTime(utcRaw),
    dateRaw,
    dateDisplay: formatNmeaDate(dateRaw),
    status,
    statusText: status === 'A' ? 'A / 有效定位' : (status === 'V' ? 'V / 无效定位' : (status || '--')),
    mode: mode || ((magneticVariation || magneticDir) ? `${magneticVariation}${magneticDir}` : '--'),
    latRaw,
    latDir,
    lonRaw,
    lonDir,
    latDecimal,
    lonDecimal,
    speedKnots: Number.isFinite(knotsVal) ? knotsVal.toFixed(3) : '--',
    speedKmh: Number.isFinite(kmhVal) ? kmhVal.toFixed(3) : '--',
    course: course || '--'
  };
}

function nmeaToDecimal(raw, dir, isLat) {
  if (!raw) return NaN;
  const degLen = isLat ? 2 : 3;
  if (raw.length < degLen) return NaN;
  const deg = Number(raw.slice(0, degLen));
  const min = Number(raw.slice(degLen));
  if (!Number.isFinite(deg) || !Number.isFinite(min)) return NaN;
  let val = deg + min / 60;
  if (dir === 'S' || dir === 'W') val *= -1;
  return val;
}

function formatUtcTime(raw) {
  if (!raw || raw.length < 6) return '--';
  const base = raw.split('.')[0];
  const frac = raw.includes('.') ? raw.split('.')[1] : '';
  const hh = base.slice(0, 2);
  const mm = base.slice(2, 4);
  const ss = base.slice(4, 6);
  return frac ? `${hh}:${mm}:${ss}.${frac} UTC` : `${hh}:${mm}:${ss} UTC`;
}

function formatNmeaDate(raw) {
  if (!raw || raw.length !== 6) return '--';
  const dd = raw.slice(0, 2);
  const mm = raw.slice(2, 4);
  const yy = raw.slice(4, 6);
  const yyyy = Number(yy) >= 80 ? `19${yy}` : `20${yy}`;
  return `${yyyy}-${mm}-${dd}`;
}

function updateParserUI(parsed) {
  els.parserStatus.textContent = `最近一次有效解析：${parsed.type} · ${parsed.utcDisplay} · ${parsed.statusText}`;
  els.gpsType.textContent = parsed.type;
  els.gpsTime.textContent = parsed.utcDisplay;
  els.gpsDate.textContent = parsed.dateDisplay;
  els.gpsStatus.textContent = parsed.statusText;
  els.gpsMode.textContent = parsed.mode || '--';

  els.gpsLat.textContent = `${parsed.latRaw || '--'} ${parsed.latDir || ''}`.trim();
  els.gpsLon.textContent = `${parsed.lonRaw || '--'} ${parsed.lonDir || ''}`.trim();

  const latTxt = Number.isFinite(parsed.latDecimal) ? parsed.latDecimal.toFixed(7) : '--';
  const lonTxt = Number.isFinite(parsed.lonDecimal) ? parsed.lonDecimal.toFixed(7) : '--';
  els.gpsDecimal.textContent = `${latTxt}, ${lonTxt}`;

  els.gpsSpeedKnots.textContent = parsed.speedKnots;
  els.gpsSpeedKmh.textContent = parsed.speedKmh;
  els.gpsCourse.textContent = parsed.course;

  parserHistory.unshift(parsed);
  if (parserHistory.length > 12) parserHistory.pop();
  renderParserTable();
}

function renderParserTable() {
  if (!parserHistory.length) {
    els.parserTableBody.innerHTML = '<tr><td colspan="7" class="empty-row">暂无解析结果</td></tr>';
    return;
  }
  els.parserTableBody.innerHTML = parserHistory.map(item => {
    const lat = Number.isFinite(item.latDecimal) ? item.latDecimal.toFixed(6) : '--';
    const lon = Number.isFinite(item.lonDecimal) ? item.lonDecimal.toFixed(6) : '--';
    return `<tr>
      <td>${escapeHtml(item.type)}</td>
      <td>${escapeHtml(item.utcDisplay)}</td>
      <td>${escapeHtml(item.dateDisplay)}</td>
      <td>${escapeHtml(item.statusText)}</td>
      <td>${escapeHtml(lat)}</td>
      <td>${escapeHtml(lon)}</td>
      <td>${escapeHtml(item.speedKmh)}</td>
    </tr>`;
  }).join('');
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function sendData() {
  if (!writer) {
    appendLog('sys', '当前未连接串口，无法发送。');
    return;
  }
  try {
    let payload;
    let display;
    if (els.hexSend.checked) {
      payload = parseHexInput(els.sendInput.value.trim());
      display = toHexString(payload);
    } else {
      const text = els.sendInput.value + els.lineEnding.value;
      payload = textEncoder.encode(text);
      display = text.replace(/\r/g, '\\r').replace(/\n/g, '\\n');
    }

    if (!payload.length) {
      appendLog('sys', '发送内容为空。');
      return;
    }

    await writer.write(payload);
    txBytes += payload.byteLength;
    updateStats();
    appendLog('tx', `[TX] ${display}`);
  } catch (err) {
    appendLog('sys', `发送失败：${err.message || err}`);
  }
}

function clearLog() {
  rawLogLines = [];
  els.log.innerHTML = '';
  appendLog('sys', '日志已清空');
}

function downloadLog() {
  const blob = new Blob([rawLogLines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  a.href = url;
  a.download = `serial_log_${stamp}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function syncParserPanel() {
  els.parserPanel.classList.toggle('hidden', !els.showParserPanel.checked);
}

els.connectBtn.addEventListener('click', requestAndConnect);
els.disconnectBtn.addEventListener('click', closePort);
els.reconnectBtn.addEventListener('click', reconnectGrantedPort);
els.sendBtn.addEventListener('click', sendData);
els.sendClearBtn.addEventListener('click', () => { els.sendInput.value = ''; });
els.clearLogBtn.addEventListener('click', clearLog);
els.downloadLogBtn.addEventListener('click', downloadLog);
els.showParserPanel.addEventListener('change', syncParserPanel);
setupAutoReconnectOnBaudChange();

els.sendInput.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    sendData();
  }
});

navigator.serial?.addEventListener?.('disconnect', async () => {
  appendLog('sys', '检测到串口设备断开。');
  try { await closePort(); } catch (_) {}
});

setSupportStatus();
setConn(false);
updateStats();
syncParserPanel();
appendLog('sys', '页面已就绪。Ctrl/Cmd + Enter 可快速发送。');


// 地图初始化
let map, marker;
setTimeout(()=>{
  if(document.getElementById("map")){
    map = L.map('map').setView([0,0],2);
    L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png').addTo(map);
  }
},1000);

// 简单解析RMC并更新地图
function tryUpdateMap(line){
  let m=line.match(/RMC,.*?,.*?,(\d+\.\d+),(N|S),(\d+\.\d+),(E|W)/);
  if(!m) return;
  let lat=parseFloat(m[1]);
  let lon=parseFloat(m[3]);
  lat = Math.floor(lat/100)+ (lat%100)/60;
  lon = Math.floor(lon/100)+ (lon%100)/60;
  if(m[2]=='S') lat*=-1;
  if(m[4]=='W') lon*=-1;

  if(map){
    map.setView([lat,lon],15);
    if(marker) marker.setLatLng([lat,lon]);
    else marker=L.marker([lat,lon]).addTo(map);
  }
}
