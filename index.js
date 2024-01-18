const express = require('express');
const ws = require('ws');
const { Client, Pool } = require('pg');
const { connection } = require('mongoose');


async function addNewUser(email, username, password) {
  try {
    const result = await dbPool.query(`INSERT INTO users(email, username, password) VALUES('${email}', '${username}', '${password}')`);
    if (result.rowCount === 1) {
      return true;
    }
    else {
      console.log('failed to add new user with unknown reason');
      return false;
    }
  }
  catch (err) {
    if (err.constraint == 'users_pkey') {
      return false;
    }
  }
}


const app = express();
const sockserver = new ws.WebSocketServer({ port: 443 })
const PORT = 3000;

app.use(express.static('../my-new-app/build'));

app.use(express.json());

app.get('/', (req, res) => {
  res.send('hi aviv');
});

app.post('/signup', async (req, res) => {
  try {
    console.log(`signup: ${JSON.stringify(req.body)}`);

    const { username, email, password } = req.body;

    if (username.length > 20) {
      res.send({ res: 'illegalUsername' });
    }
    else if (!/\w+/.test(email) || email.length > 40) {
      res.send({ res: 'illegalEmail' });
    }
    else if (password.length > 20) {
      res.send({ res: 'illegalPassword' });
    }

    try {
      const result = await dbPool.query(`INSERT INTO users(email, username, password) VALUES('${email}', '${username}', '${password}') RETURNING email, username, password, id`);
      if (result.rowCount === 1) {
        console.log(`new user: email: ${email}, username: ${username}, password: ${password} was added`);
        res.send({ res: 'success', data: { me: result.rows[0], friends: [] } });
      }
      else {
        console.log(`failed to add new user: email: ${email}, username: ${username}, password: ${password} to users table (unknown reason)`);
        res.send({ res: 'fail' });
      }
    }
    catch (err) {
      if (err.constraint == 'users_pkey') {
        res.send({ res: 'emailExist' });
      }
    }
  }
  catch (err) {
    console.log(`signup error: ${err}`);
  }
});

app.post('/addFriend', async (req, res) => {
  try {
    console.log(`/addFriend: ${JSON.stringify(req.body)}`);

    const { myEmail, myPassword, friendEmail } = req.body;

    if (!/\w+/.test(myEmail) || myEmail.length > 40 || !/\w+/.test(friendEmail) || friendEmail.length > 40) {
      res.send({ res: 'illegalEmail' });
    }

    const me = await dbPool.query(`SELECT id, password FROM users WHERE email = '${myEmail}'`);

    if (me.rowCount === 0) {
      res.send({ res: 'emailNotExist' });
    }
    else if (me.rows[0].password !== myPassword) {
      res.send({ res: 'wrongPassword' });
    }
    else {
      const friend = await dbPool.query(`SELECT id, username, email, CURRENT_TIMESTAMP AS date, '' AS text, true AS isfromme FROM users WHERE email = '${friendEmail}'`);

      if (friend.rowCount === 0) {
        res.send({ res: 'emailNotExist' });
      }
      else {
        let result = await dbPool.query(`SELECT fromuserid FROM messages WHERE (fromuserid = ${me.rows[0].id} AND touserid = ${friend.rows[0].id}) OR (fromuserid = ${friend.rows[0].id} AND touserid = ${me.rows[0].id})`);

        if (result.rowCount !== 0) {
          res.send({ res: 'friendAlreadyExist' });
        }
        else {
          result = await dbPool.query(`INSERT INTO messages(fromuserid, touserid, text) VALUES(${me.rows[0].id}, ${friend.rows[0].id}, '')`);

          if (result.rowCount === 1) {
            res.send({ res: 'success', data: friend.rows[0]});
          }
          else {
            res.send({ res: 'fail' });
          }
        }
      }
    }
  }
  catch (err) {
    console.log(err);
    res.send({ res: 'fail' });
  }
});

app.post('/login', async (req, res) => {
  try {
    console.log(`/login: ${JSON.stringify(req.body)}`);

    const { email, password } = req.body;

    if (!/\w+/.test(email) || email.length > 40) {
      res.send({ res: 'illegalEmail' });
    }
    else if (password.length > 20) {
      res.send({ res: 'illegalPassword' });
    }

    let result = await dbPool.query(`SELECT id, password FROM users WHERE email = '${email}'`);

    if (result.rowCount === 0) {
      res.send({ res: 'emailNotExist' });
    }
    else if (result.rows[0].password !== password) {
      res.send({ res: 'wrongPassword' });
    }
    else {
      const friends = await dbPool.query(`        
        WITH usermessages AS (
          SELECT touserid AS id, username, email, date, text, true AS isfromme
          FROM messages INNER JOIN users ON users.id = touserid
          WHERE fromuserid = ${result.rows[0].id}
          UNION
          SELECT fromuserid AS id, username, email, date, text , false AS isfromme
          FROM messages INNER JOIN users ON users.id = fromuserid
          WHERE touserid = ${result.rows[0].id}
        ), usermessagesmaxdate AS (
          SELECT id, username, email, date, text, isfromme, MAX(date) OVER(PARTITION BY username) AS maxdate
          FROM usermessages
        )
        SELECT id, username, email, date, text, isfromme
        FROM usermessagesmaxdate
        WHERE date = maxdate
        ORDER BY date
      `);

      const me = await dbPool.query(`SELECT id, username, email, password FROM users WHERE email = '${email}'`)

      res.send({ res: 'success', data: { me: me.rows[0], friends: friends.rows } });
    }
  }
  catch (err) {
    console.log(err);
    res.send({ res: 'fail' });
  }
});

app.get('/messages', async (req, res) => {
  try {
    const myId = parseFloat(req.query.myId);
    const friendId = parseFloat(req.query.friendId);

    console.log(`/messages myId: ${myId}, friendId: ${friendId}`);

    if (isNaN(myId) || isNaN(friendId)) {
      res.send({ res: 'illegalParams' });
      return;
    }

    const messages = await dbPool.query(`
      SELECT fromuserid, touserid, date, text
      FROM messages
      WHERE fromuserid = ${myId} AND touserid = ${friendId}
      UNION
      SELECT fromuserid, touserid, date, text
      FROM messages
      WHERE fromuserid = ${friendId} AND touserid = ${myId}
      ORDER BY date;
    `);

    res.send({ res: 'success', data: messages.rows });
  }
  catch (err) {
    console.log(`/messages: ${err}`);
    res.send('fail');
  }
});

const connectedUsers = new Map();

sockserver.on('connection', (ws, req) => {
  let isFirstMessage = true;
  let user = null;

  console.log(`new connection: ip: ${req.socket.remoteAddress}, port: ${req.socket.remotePort}`);

  ws.on('close', () => console.log(`connection closed: ${req.socket.remoteAddress}, port: ${req.socket.remotePort}`));

  ws.onerror = function () {
    console.log('websocket error')
  }

  ws.on('message', async msg => {
    try {
      if (isFirstMessage) {
        isFirstMessage = false;

        user = JSON.parse(msg);

        let result = await dbPool.query(`SELECT id FROM users WHERE email = '${user.email}' AND password = '${user.password}'`);

        if (result.rowCount === 0) {
          ws.close();
        }
        else {
          connectedUsers.set(user.id, ws);
        }
      }
      else {
        const message = JSON.parse(msg);

        let result = await dbPool.query(`SELECT id FROM messages WHERE fromuserid = '${message.fromuserid}' OR touserid = '${message.touserid}'`);
        if (result.rowCount === 0) {
          console.log(`${message.fromuserid} is not a friend of ${message.touserid}`);
          ws.close();
          connectedUsers.delete(user.id);
        }
        else {
          dbPool.query(`INSERT INTO messages(fromuserid, touserid, text) values(${message.fromuserid}, ${message.touserid}, '${message.text}')`);

          if (connectedUsers.has(message.touserid)) {
            const friendWS = connectedUsers.get(message.touserid);
            console.log(`${message.fromuserid} sent "${message.text}" to ${message.touserid}`);
            friendWS.send(JSON.stringify({ fromuserid: message.fromuserid, touserid: message.touserid, text: message.text, date: new Date() }));
          }
          else {
            console.log(`send notification to ${message.touserid}`);
          }
        }
      }
    }
    catch (err) {
      console.log(`websocket onmessage: ${err}`);
      ws.close();
      connectedUsers.delete(user.id);
    }
  })
});

const dbPool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'chat',
  password: 'Klavlav',
  port: 5432
});



app.listen(PORT, async () => {
  try {
    console.log(`server listening on port ${PORT}`);
  }
  catch (err) {
    console.log(err);
  }
});