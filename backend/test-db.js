const mysql = require('mysql2/promise');

async function test() {
  console.log('Testing MySQL connection...');
  console.log('Host: 127.0.0.1, Port: 3306, User: root, Password: (empty)');
  
  try {
    const conn = await mysql.createConnection({
      host: '127.0.0.1',
      port: 3306,
      user: 'root',
      password: '',
      connectTimeout: 10000
    });
    console.log('SUCCESS! Connected to MySQL');
    await conn.end();
  } catch (err) {
    console.log('FAILED:', err.message);
    console.log('Error code:', err.code);
  }
}

test();
