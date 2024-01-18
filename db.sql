DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS users;

CREATE TABLE IF NOT EXISTS users (
  email VARCHAR(40) PRIMARY KEY CHECK (email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$'),
  username VARCHAR(20) CHECK (username ~ '^[A-Za-z_0-9]+$') NOT NULL,
  password VARCHAR(20) NOT NULL,
  id SERIAL UNIQUE
);

CREATE TABLE IF NOT EXISTS messages (
  fromUserid INT REFERENCES users(id) ON DELETE SET NULL,
  touserid INT REFERENCES users(id) ON DELETE SET NULL,
  text VARCHAR(1024),
  date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  id SERIAL,
  PRIMARY KEY(fromUserid, toUserid, id)
);

CREATE INDEX if not exists message_fromUser_id on messages(fromUser, id);
CREATE INDEX if not exists message_toUser_id on messages(toUser, id);
create index if not exists message_id on messages(id);

insert into users values('avivcohen333@gmail.com', 'avivcohen91', 'avivCohen');
insert into users values('sapircohen333@gmail.com', 'sapircohen94', 'sapirCohen');
insert into users values('kelev333@gmail.com', 'kelev123', 'havhav');

insert into messages values(1, 2, 'hi, whatsapp?');
insert into messages values(2, 1, 'all good');
insert into messages values(1, 3, 'hello');
insert into messages values(3, 1, 'bye');

