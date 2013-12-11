var express = require('express');
var GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;
var passport = require('passport');
var swig = require('swig');

var mail = require('./lib/mail.js');

var app = express();

var BASE_URL = 'http://' + process.env.HOST + ':' + process.env.PORT;

swig.setDefaults({
  // Swig's caching
  cache: false
});

app.engine('html', swig.renderFile);

app.set('view engine', 'html');
app.set('views', __dirname + '/views');
//app.set('view options', { layout: false });
// Express' own caching
app.set('view cache', false);

//app.use(express.logger());

app.use(express.static(__dirname + '/public'));
app.use('/bower', express.static(__dirname + '/bower_components'));

app.use(express.cookieParser());
app.use(express.urlencoded());
app.use(express.json());
app.use(express.session({ secret: 'spinbox' }));

app.use(passport.initialize());
app.use(passport.session());

app.use(app.router);

passport.serializeUser(function (user, done) {
  done(null, user);
});

passport.deserializeUser(function (obj, done) {
  done(null, obj);
});

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: BASE_URL + '/auth/callback',
    scope: ['openid', 'email', 'https://mail.google.com']
  },
  function (accessToken, refreshToken, profile, done) {
    profile.accessToken = accessToken;
    profile.refreshToken = refreshToken;

    profile.email = profile.emails[0].value;

    return done(null, profile);
  }
));

app.get('/auth', passport.authenticate('google'));

app.get('/auth/callback',
  passport.authenticate('google', {
    failureRedirect: '/auth'
  }), function (req, res) {
    req.session.accessToken = req.user.accessToken;
    req.session.refreshToken = req.user.refreshToken;

    req.session.email = req.user.email;

    res.redirect('/');
  });

app.get('/', function (req, res) {
  if (!req.session.accessToken) {
    return res.redirect('/auth');
  }

  res.render('index.html');
});

app.get('/favicon.ico', function (req, res) {
  res.send(404);
});

app.get('/session', function (req, res) {
  if (!req.session.accessToken) {
    return res.redirect('/auth');
  }

  res.json({ session: req.session });
});

app.get('/mock-mail', function (req, res) {
  res.set('Content-Type', 'application/octet-stream');

  mail.getMockMessages(function (err, stream) {
    stream.pipe(res);
  });
});

app.get('/mail', function (req, res) {
  if (!req.session.accessToken) {
    return res.send(401);
  }

  res.set('Content-Type', 'application/octet-stream');

  mail.getMessages(req.session.email,
    req.session.accessToken, req.session.refreshToken,
    function (err, stream) {
      if (err) {
        console.error(err);

        return res.send(err);
      }

      stream.pipe(res);
    });
});

app.listen(process.env.PORT);
