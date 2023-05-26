const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const cookieParser = require('cookie-parser');
const passport = require("passport");
const LocalStrategy = require("passport-local");
const socket = require("socket.io");
const dotenv = require("dotenv");
const flash = require("connect-flash");
const Post = require("./models/Post");
const User = require("./models/User");

//GJ inserted by
const morgan=require('morgan')
const winston=require('./config/winston')

const helmet=require('helmet');
const hpp=require('hpp')
//GJ

const port = process.env.PORT || 3000;
const onlineChatUsers = {};

dotenv.config();

const postRoutes = require("./routes/posts");
const userRoutes = require("./routes/users");
const app = express();

app.set("view engine", "ejs");

/* Middleware */
//GJ inserted by
if(process.env.NODE_ENV === 'production'){
    app.use(morgan('combined'))
} else {
    app.use(morgan('dev'))
}
const sessOptions={
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: false,
    }
};
if(process.env.NODE_ENV === 'production'){
    //GJ variable setting changable like this in case of production mode
    //sessOptions.proxy=true; // GJ: when use proxy
    //sessOptions.cookie.secure=true; // GJ: When use cookiie only with https
}
app.use(session(sessOptions));

//GJ register to use helmet, hpp when security is needed.
if(process.env.NODE_ENV === 'production'){
    //GJ variable setting changable like this in case of production mode
    //app.enable('trust proxy');
    app.use(morgan('combined'));
    app.use(helmet({ contentSecurityPolicy: false}));
    app.use(hpp());
} else {
    app.use(morgan('dev'));
}
//GJ

app.use(cookieParser(process.env.SECRET))
app.use(session({
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: false
})
);
app.use(flash());

/* Passport setup */
app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

/* Middleware */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

/* MongoDB Connection */
mongoose
    .connect("mongodb://127.0.0.1:27017/facebook_clone", {
        useNewUrlParser: true,
        useCreateIndex: true,
        useUnifiedTopology: true
    })
    .then(() => {
        console.log("Connected to MongoDB");
    })
    .catch((err) => {
        console.log(err);
        winston.error(err);
    });

/* Template 파일에 변수 전송 */
app.use((req, res, next) => {
    res.locals.user = req.user;
    res.locals.login = req.isAuthenticated();
    res.locals.error = req.flash("error");
    res.locals.success = req.flash("success");
    next();
});

/* Routers */
app.use("/", userRoutes);
app.use("/", postRoutes);

const server = app.listen(port, () => {
    console.log("App is running on port " + port);
    winston.info("App is running on port " + port);
});

/* WebSocket setup */
const io = socket(server);

const room = io.of("/chat");
room.on("connection", socket => {
    console.log("new user : ", socket.id);
    winston.info("new user : ", socket.id);

    room.emit("newUser", { socketID: socket.id });

    socket.on("newUser", data => {
        if (!(data.name in onlineChatUsers)) {
            onlineChatUsers[data.name] = data.socketID;
            socket.name = data.name;
            room.emit("updateUserList", Object.keys(onlineChatUsers));
            console.log("Online users: " + Object.keys(onlineChatUsers));
            winston.info("Online users: " + Object.keys(onlineChatUsers));
        }
    });

    socket.on("disconnect", () => {
        delete onlineChatUsers[socket.name];
        room.emit("updateUserList", Object.keys(onlineChatUsers));
        console.log(`user ${socket.name} disconnected`);
        winston.info(`user ${socket.name} disconnected`);
    });

    socket.on("chat", data => {
        console.log(data);
        if (data.to === "Global Chat") {
            room.emit("chat", data);
        } else if (data.to) {
            room.to(onlineChatUsers[data.name]).emit("chat", data);
            room.to(onlineChatUsers[data.to]).emit("chat", data);
        }
    });
});