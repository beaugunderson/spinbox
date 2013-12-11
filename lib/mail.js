var async = require('async');
var debug = require('debug')('spinbox');
var Imap = require('imap');
var juice = require('juice');
var MailParser = require('mailparser').MailParser;
var Readable = require('stream').Readable;
var uniqueRandom = require('unique-random');
var xoauth2 = require('xoauth2');
var _ = require('lodash');

function randomIds(lowerBound, upperBound, count) {
  var generator = uniqueRandom(lowerBound, upperBound);

  return _.times(count, generator);
}

function juiceMessage(message, cb) {
  async.nextTick(function () {
    debug('got message');
    debug('message size %d', JSON.stringify(message).length);

    cb(null, message);
  });

  return;

  if (!message.body.html) {
    async.nextTick(function () {
      cb(null, message);
    });

    return;
  }

  juice.juiceContent(message.body.html, {
    url: '.',
    applyLinkTags: false
  }, function (err, html) {
    message.body.inlineHtml = html;

    cb(err, message);
  });
}

function getMessages(token, opt_messages) {
  if (!opt_messages) {
    opt_messages = 10;
  }

  var imap = new Imap({
    xoauth2: token,
    host: 'imap.gmail.com',
    port: 993,
    tls: true,
    tlsOptions: { rejectUnauthorized: false }
  });

  var readable = new Readable();

  readable._read = function () {};

  readable.push('{');

  imap.once('ready', function () {
    imap.openBox('INBOX', true, function (err, box) {
      if (err) {
        throw err;
      }

      var sendEnd = _.after(opt_messages + 1, function () {
        console.log('XXX sendEnd');

        readable.push(']}');
        readable.push(null);

        imap.end();
      });

      var firstMessage = true;

      var queue = async.queue(function (message, cb) {
        if (firstMessage) {
          firstMessage = false;
        } else {
          readable.push(',');
        }

        juiceMessage(message, function (err, inlinedMessage) {
          readable.push(JSON.stringify(inlinedMessage));

          sendEnd();

          cb();
        });
      }, 2);

      readable.push('"statistics": { "messages": ' +
        box.messages.total + ' },');
      readable.push('"messages": [');

      // XXX: These come back sorted by date for some reason, do we care?
      var ids = randomIds(1, box.messages.total, opt_messages);

      console.log('XXX ids', ids);

      var fetch = imap.seq.fetch(ids, { bodies: '' });

      fetch.on('message', function (msg) {
        var message = {};

        var sendMessage = _.after(2, function () {
          queue.push(message);
        });

        msg.on('body', function (stream) {
          var mailparser = new MailParser({
            defaultCharset: 'utf-8',
            showAttachmentLinks: true
          });

          mailparser.once('end', function (body) {
            message.body = body;

            sendMessage();
          });

          stream.pipe(mailparser);
        });

        msg.once('attributes', function (attributes) {
          message.attributes = attributes;
        });

        msg.once('end', function () {
          sendMessage();
        });
      });

      fetch.once('error', function (err) {
        console.error('Fetch error:', err);

        readable.push(null);
      });

      fetch.once('end', function () {
        console.log('XXX fetch.end');

        sendEnd();
      });
    });
  });

  imap.once('error', function (err) {
    console.error('IMAP error:', err);
  });

  imap.once('end', function () {
    console.log('Connection ended');
  });

  imap.connect();

  return readable;
}

exports.getMessages = function (email, accessToken, refreshToken, cb) {
  var x = xoauth2.createXOAuth2Generator({
    user: email,
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    accessToken: accessToken,
    refreshToken: refreshToken
  });

  x.getToken(function (err, token) {
    if (err) {
      return cb(err);
    }

    var stream = getMessages(token);

    cb(err, stream);
  });
};

exports.getMockMessages = function (cb) {
  var chunks = [];

  var readable = new Readable();

  readable._read = function () {};

  chunks.push('{ "statistics": { "messages": 5 },');
  chunks.push('"messages": [');

  for (var i = 0; i < 100; i++) {
    chunks.push('{ "subject": "test" },');
  }

  chunks.push(']}');
  chunks.push(null);

  cb(null, readable);
};
