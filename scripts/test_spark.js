// 🧪 Script de prueba para demostrar los estados y notificaciones de Spark Desktop

const http = require('http');

function sendPost(path, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const req = http.request(
      {
        hostname: 'localhost',
        port: 7890,
        path: path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve(JSON.parse(body || '{}')));
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runDemo() {
  console.log('🚀 Iniciando Demo de Spark AI Desktop...\n');

  try {
    // 1. Estado Trabajando
    console.log('1️⃣ Claude está analizando el código...');
    await sendPost('/api/state', {
      state: 'working',
      agent: 'claude',
      message: 'Claude está revisando la base de datos...'
    });
    await sleep(3500);

    // 2. Solicitud de confirmación interactiva
    console.log('2️⃣ Knock Knock! Hermes solicita aprobación de comando...');
    sendPost('/api/notify?wait=true', {
      agent: 'hermes',
      state: 'waiting',
      title: 'Hermes requiere autorización',
      message: '¿Deseas aplicar la migración SQL a la base de datos?',
      actions: ['Aprobar Migración', 'Cancelar'],
      timeout: 30,
      sound: true
    }).then((response) => {
      console.log('🎯 ¡Respuesta recibida del usuario en tiempo real!:', response);
    });

    await sleep(6000);

    // 3. Antigravity Tarea completada
    console.log('3️⃣ Antigravity finalizó una tarea con éxito ✨');
    await sendPost('/api/notify', {
      agent: 'antigravity',
      state: 'done',
      title: '¡Tarea completada!',
      message: 'Spark Desktop y todos los módulos están listos para usar.',
      actions: ['¡Excelente!'],
      timeout: 10,
      sound: true
    });

    await sleep(4000);

    // 4. Volver a calma
    console.log('4️⃣ Spark vuelve a modo reposo.');
    await sendPost('/api/state', {
      state: 'calm',
      agent: 'spark',
      message: 'Spark Listo'
    });

    console.log('\n✅ Demo finalizada con éxito.');
  } catch (err) {
    console.error('❌ Error ejecutando la demo (asegúrate de que Spark Desktop esté iniciado):', err.message);
  }
}

runDemo();
