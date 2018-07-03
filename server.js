var express = require('express'),
    app = express(),
    server = require('http').createServer(app),
    io = require('socket.io').listen(server),
    Redis = require('ioredis'),
    fs = require('fs'),
    md5 = require('md5'),
    app_config = require('./config'),//配置文件
    common_func = require('./library/common'),//公用函数
    bodyParser = require('body-parser'),
    genericPool = require("generic-pool"),
    redis_subscribe_client = redis_publish_client= redis_client = null,//redis客户端
    redis_publish_channel = "xin_common_chat",//发布订阅频道
    xin_socket_connections = "xin_socket_connections",//redis key
    xin_socket_message_location = "xin_socket_message_location",//redis key
    xin_socket_session_location = "xin_socket_session_location",//redis key
    expire_time = 60 * 60 * 12, //redis过期时间
    urlencodedParser = bodyParser.urlencoded({ extended: false }),// 创建 application/x-www-form-urlencoded 编码解析
    server_ip = common_func.getIPAdress(), //server端IP 
    file_common = app_config.log_dir + common_func.getDate(),
    xin_client_log = file_common + "/client.log",//记录所有访问记录
    xin_msg_log = file_common +"/msg.log",//记录消息日志
    xin_sys_log = file_common + "/sys.log",//记录系统日志
    xin_error_log = file_common + "/error.log"//记录系统错误日志
    ;

/*
console.log("process.pid",process.pid);
//程序退出事件监听
function handle(signal) {
  fs.appendFile(xin_sys_log, msg_common +" Received signal:"+signal, 'utf8', function(err){});
}
process.on('SIGINT', handle);
process.on('SIGTERM', handle);
process.on('SIGKILL', handle);
process.on('SIGSTOP', handle);
process.on('SIGWINCH', handle);
process.on('SIGBREAK', handle);
*/
//异常情况处理
function uncaughtExceptionHandler(err){
    var error_info = err;
    if(typeof(error_info) == "object"){
        error_info = JSON.stringify(error_info);
    }
    
    if(err && (err.code == 'ECONNREFUSED' || err.code == 'ECONNRESET')){
        //redis 异常
        fs.appendFile(xin_error_log, '\r\n<br>' + common_func.formatDate() +"["+ server_ip +"] uncaughtExceptionHandler:"+error_info, 'utf8', function(err){});
    }else{
        console.log("process exit:uncaughtExceptionHandler:",err);
        fs.appendFile(xin_error_log, '\r\n<br>' + common_func.formatDate() +"["+ server_ip +"] process exit: uncaughtExceptionHandler:"+error_info, 'utf8', function(err){});
        process.exit(1);
    }
}
process.on('uncaughtException', uncaughtExceptionHandler);

//检测日志文件夹是否创建
common_func.createFolder(app_config.log_dir + common_func.getDate());
//凌晨重新生成新的消息记录文件
setInterval(function(){
    var d = new Date();
    if(d.getHours() == 0){
        var file_common = app_config.log_dir + common_func.getDate();
        var msg_common = '\r\n<br>' + common_func.formatDate() +"["+ server_ip +"] ";
        try{
            //检测日志文件夹是否创建
            common_func.createFolder(file_common);
            //更新文件路径
            xin_msg_log = file_common +"/msg.log";
            xin_sys_log = file_common + "/sys.log";
            xin_client_log = file_common + "/client.log";
            xin_error_log = file_common + "/error.log";
            //记录日志信息
            fs.appendFile(xin_sys_log, msg_common +" xin_msg_log: "+ xin_msg_log, 'utf8', function(err){});
            fs.appendFile(xin_sys_log, msg_common +" xin_sys_log: "+ xin_sys_log, 'utf8', function(err){});
            fs.appendFile(xin_sys_log, msg_common +" xin_client_log: "+ xin_client_log, 'utf8', function(err){});
            fs.appendFile(xin_sys_log, msg_common +" xin_error_log: "+ xin_error_log, 'utf8', function(err){});

            //删除当天在线数据
            for(var p in app_config.source_list){
                var redis_today_key = xin_socket_connections + "_today_" + p;
                redisPool.acquire().then(function(client){
                    client.del(redis_today_key);
                    redisPool.release(client);
                }).catch(function(err){
                    fs.appendFile(xin_error_log, msg_common +" redis_pool error: "+ JSON.stringify(err), 'utf8', function(err){});
                });
            }
        }catch(err){
            fs.appendFile(xin_sys_log, msg_common +" setInterval err: "+ err, 'utf8', function(err){});
        }
    }
},1000*60*30);

Redis.Promise.onPossiblyUnhandledRejection(function (error) {
    console.log(error);
  // error.command.name is the command name, here is 'set'
  // error.command.args is the command arguments, here is ['foo']
});

//local：本地环境 || development：开发环境 || production：正式环境
//redis 连接参数设置 https://github.com/luin/ioredis/blob/HEAD/API.md
var redis_connect_option = {
    'host' : app_config.redis_config.host,
    'port' : app_config.redis_config.port,
    //'retry_max_delay': 3000,
    //'max_attempts' : redis_max_attempts,
    'autoResendUnfulfilledCommands': true,
    'keyPrefix': 'node.xin.com:',
    'retryStrategy': function (times) {
        if (times % 10 == 0) {
            //重试次数 每10次刷新页面
            io.sockets.emit("refreshPage");
        }
        // reconnect after  
        return Math.min(times * 100, 3000);
    },
    'reconnectOnError': function(err){
        console.log("reconnectOnError:",err);
    }
};
//创建redis连接池---begin
var redis_factory = {
  create: function() {
    client = new Redis(redis_connect_option);
    client.on("reconnecting", function (err) {
        fs.appendFile(xin_sys_log, '\r\n<br>' + common_func.formatDate() +"["+ server_ip +"] redis_pool_client reconnecting:"+JSON.stringify(err), 'utf8', function(err){});
        console.log("redis_pool_client reconnecting");
    });
    client.on("connect", function () {
        fs.appendFile(xin_sys_log, '\r\n<br>' + common_func.formatDate() +"["+ server_ip +"] redis_pool_client connected", 'utf8', function(err){});
        console.log("redis_pool_client connected");
    });
    client.on("error", function () {
    	fs.appendFile(xin_sys_log, '\r\n<br>' + common_func.formatDate() +"["+ server_ip +"] redis_pool_client error", 'utf8', function(err){});
        console.log("redis_pool_client error");
    });
    return client;
  },
  destroy: function(client) {
    client.disconnect()
  }
};
var redis_opts = {
  max: 16, // maximum size of the pool
  min: 2 // minimum size of the pool
};
var redisPool = genericPool.createPool(redis_factory, redis_opts);
redisPool.on('factoryCreateError', function(err){
  //log stuff maybe
});

redisPool.on('factoryDestroyError', function(err){
  //log stuff maybe
});
//创建redis连接池---end

/**************  web接口 ******************/
app.get('/', function(req, res){
  res.send("^_^ Hello to xin node service  ^_^");
});
//接收消息接口
app.post('/api/notify', urlencodedParser, function(req, res){
    // 够造 JSON 格式
    var result = {
        "code": 0,
        "msg": "",
        "data": ""
    }; 
    //发布的消息
    var message = {
       "source":req.body.source,
       "data":req.body.data,
       "sign":req.body.sign,
       "room_id":req.body.room_id,
       "filename":req.body.filename,
       "from_sys":true,
       "ip":server_ip
    };
    try{
        //验证数据
        if(message.source == undefined || message.source == "")
            throw "source can not be null!";
        if(message.data == undefined || message.data == "")
            throw "data can not be null!";
        if(message.sign == undefined || message.sign == "")
            throw "sign can not be null!";
        if(message.room_id == undefined || message.room_id == "")
            throw "room_id can not be null!";
        var sign_key = app_config.source_list[message.source].sign_key;
        if(sign_key == undefined)
            throw "this source can not be configured!";
        //验证签名
        var check_sign = md5(message.source + message.room_id + message.data + sign_key);
        //console.log("check_sign",check_sign);
        if(check_sign != message.sign)
            throw "api notify sign verify failed!";            
        delete message['sign'];
        if(message.filename == undefined){
            message.filename = "";
        }
        redisPool.acquire().then(function(client){
            client.publish(redis_publish_channel, JSON.stringify(message));
            client.hincrby(xin_socket_message_location,server_ip,1); 
            redisPool.release(client);
        }).catch(function(err){
            fs.appendFile(xin_error_log, '\r\n<br>' + common_func.formatDate() +"["+ server_ip +"] redis_pool error: "+ JSON.stringify(err), 'utf8', function(err){});
        });
        result.code = 1;
        result.msg = "message notify successed!";        
        
    }catch(err){
        result.code = 0;
        result.msg = err;
    }
    res.end(JSON.stringify(result));
});
//强制刷新客户端页面
app.get('/refreshpage', function(req, res){
    room = req.query.room;
    if(room != undefined)
        io.to(room).emit("refreshPage");
    else
        io.sockets.emit("refreshPage");
    res.send("refreshPage:"+room);
});
//读取消息记录
app.get("/readmsg", function (req, res) {
    source = req.query.source;
    filename = req.query.filename;
    if(source == undefined || source == "")
        return res.send("请指定source查询！");
    if(filename != undefined && common_func.trim(filename) != ""){
        var save_msg_log = xin_msg_log.replace("msg.log",source +"_"+ common_func.trim(filename));
    }else{
        var save_msg_log = xin_msg_log.replace("msg",source+"_msg");
    }
    
    fs.readFile(save_msg_log, 'utf8', function(err){}, function (err, data) {
        res.send(data);
    });
});
//读取系统消息记录
app.get("/readsysmsg", function (req, res) {
    fs.readFile(xin_sys_log, 'utf8', function(err){}, function (err, data) {
        if(err){
            res.send(err);
        }else{
            res.send(data);
        }
    });
});
//读取socket连接数
app.get("/read_connections",function(req,res){
    redisPool.acquire().then(function(client){
        client.get(xin_socket_connections,function (err, nums) {
            redisPool.release(client);
            if(err){
                res.send(err);
            }else{
                nums = nums>0 ? nums : 0;
                res.send("<p>总连接数：" + nums + "</p>");
            }            
        });            
    }).catch(function(err){
        fs.appendFile(xin_error_log, '\r\n<br>' + common_func.formatDate() +"["+ server_ip +"] redis_pool error: "+ JSON.stringify(err), 'utf8', function(err){});
        res.send(JSON.stringify(err));
    });
});

//查看消息处理分布
app.get("/readmsglocation",function(req,res){
    redisPool.acquire().then(function(client){
        client.hgetall(xin_socket_message_location, function (err, clients) {
            redisPool.release(client);
            if(err){
                res.send(err);
            }else{
                str = "当前消息分布：<br>";
                for(var p in clients){
                    str += p +"->"+ clients[p] +"<br>";
                }
                res.send(str);
            }
        });
    }).catch(function(err){
        fs.appendFile(xin_error_log, '\r\n<br>' + common_func.formatDate() +"["+ server_ip +"] redis_pool error: "+ JSON.stringify(err), 'utf8', function(err){});
        res.send(JSON.stringify(err));
    });                
});

//查看会话分布
app.get("/sessionlocation",function(req,res){
    redisPool.acquire().then(function(client){
        client.hgetall(xin_socket_session_location, function (err, clients) {
            redisPool.release(client);
            if(err){
                res.send(err);
            }else{
                str = "当前会话分布：<br>";
                for(var p in clients){
                    str += p +"->"+ clients[p] +"<br>";
                }
                res.send(str);
            }
        });
    }).catch(function(err){
        fs.appendFile(xin_error_log, '\r\n<br>' + common_func.formatDate() +"["+ server_ip +"] redis_pool error: "+ JSON.stringify(err), 'utf8', function(err){});
        res.send(JSON.stringify(err));
    });                
});

//查看今天会话统计
app.get("/today",function(req,res){
    source = req.query.source;
    if(source == undefined || source == "")
        return res.send("请指定source查询！");
    var redis_today_key = xin_socket_connections + "_today_" + source;
    var str = "";
    redisPool.acquire().then(function(client){
        client.hgetall(redis_today_key, function (err, clients) {
            redisPool.release(client);
            if(err){
                res.send(err);
            }else{
                var user_count = 0;
                var session_count = 0;
                str += "当天用户链接数<br>";
                for(var p in clients){
                    str += p +":"+ clients[p] +"<br>";
                    user_count += 1;
                    session_count += parseInt(clients[p]);
                }
                str += "<br> 用户总数："+user_count+" 会话总数："+session_count;
                res.send(str);
            }
        });
        
    }).catch(function(err){
        fs.appendFile(xin_error_log, '\r\n<br>' + common_func.formatDate() +"["+ server_ip +"] redis_pool error: "+ JSON.stringify(err), 'utf8', function(err){});
        res.send(JSON.stringify(err)); 
    });
});
//查看在线会话
app.get("/online",function(req,res){
    source = req.query.source;
    if(source == undefined)
        return res.send("请指定source查询！");
    var redis_key = xin_socket_connections + "_" + source;
    var str = "";
    redisPool.acquire().then(function(client){
        client.hgetall(redis_key, function (err, clients) {
            redisPool.release(client);
            if(err){
                res.send(err);
            }else{
                var users = {};
                var user_count = 0;
                var session_count = 0;
                for(var p in clients){//遍历json对象的每个key/value对,p为key 
                  user =  JSON.parse(clients[p]);
                  if(users[user['username']] != undefined){
                        users[user['username']] += 1; 
                  }else{
                        user_count += 1;
                        users[user['username']] = 1; 
                  }  
                  session_count += 1;
                }  
                str += "当前在线用户列表：<br>用户总数："+user_count+"<br>会话链接数："+session_count+"<br><br>";
                for(var u in users){//遍历json对象的每个key/value对,p为key  
                  str += u +":"+ users[u] +"<br>";         
                } 
                
                str += "<br>"
                for(var p in clients){//遍历json对象的每个key/value对,p为key  
                  str += clients[p] + "<br>";         
                }  
                res.send(str);
            }        
        });
    }).catch(function(err){
        fs.appendFile(xin_error_log, '\r\n<br>' + common_func.formatDate() +"["+ server_ip +"] redis_pool error: "+ JSON.stringify(err), 'utf8', function(err){});
        res.send(JSON.stringify(err)); 
    });
});

//读取访问轨迹
app.get("/clientlog",function(req,res){
    fs.readFile(xin_client_log, 'utf8', function(err){}, function (err, data) {
        if(err){
            res.send(err);
        }else{
            res.send(data);
        }
    });
});
//读取error log
app.get("/errorlog",function(req,res){
    fs.readFile(xin_error_log, 'utf8', function(err){}, function (err, data) {
        if(err){
            res.send(err);
        }else{
            res.send(data);
        }
    });
});
//监听端口，开启服务
server.listen(app_config.port || 4000);

/*************Socket.io Server ***********/
io.use(function(socket,next){
    var source = socket.handshake.query.source;
    var userid = socket.handshake.query.userid;
    var username = socket.handshake.query.username;
    var sign = socket.handshake.query.sign;
    var room_ids = socket.handshake.query.room_ids;
    var ext_info = socket.handshake.query.ext_info;
    var watch_quit = socket.handshake.query.watch_quit;//监听退出
    var referer = socket.handshake.headers.referer;
    try{
        //check referer
        /*if(referer.indexOf("xx.com")==-1)
            throw "illegal websocket request!";*/
        //验证数据
        if(source == undefined || source == "")
            throw "source can not be null!";
        if(sign == undefined || sign == "")
            throw "cilent connect sign can not be null!";
        if(room_ids == undefined || room_ids == "" || room_ids == "*")
            throw "room_ids can not be null!";
        var sign_key = app_config.source_list[source].sign_key;
        if(sign_key == undefined)
            throw "this source can not be configured!";

        var check_sign = md5(source + room_ids + sign_key);
        //console.log("check_sign",check_sign);
        if(check_sign != sign)
            throw "sign verify failed!";   
        //记录客户端信息
        socket.source = source;
        socket.userid = userid;
        socket.username = username;
        socket.sign = sign;
        socket.room_ids = room_ids;
        socket.referer = referer;
        socket.ext_info = (ext_info == undefined ? "" : ext_info);
        socket.watch_quit = (watch_quit == undefined ? "" : watch_quit);
        socket.getClientInfo = function(){
        	return {
		        'socket_id': socket.id,
		        'source': source,
		        'userid': userid,
		        'username': username,
		        'room_ids': room_ids,
		        'referer': referer,
		        'ext_info': socket.ext_info,
                'watch_quit': socket.watch_quit,
		        'server_ip': server_ip
		    };
        };
        //console.log(socket);        
        return next();
    }catch(err){
        socket.emit("sys_error", err);
        client = {
            'socket_id': socket.id,
            'source': source==undefined?"undefined":source,
            'userid': userid==undefined?"undefined":userid,
            'username': username==undefined?"undefined":username,
            'room_ids': room_ids==undefined?"undefined":room_ids,
            'referer': referer,
            'ext_info': ext_info==undefined?"undefined":ext_info,
            'watch_quit': watch_quit==undefined?"undefined":watch_quit,
            'server_ip': server_ip
        };
        var error_info = {
            'sys_info': true,
            'key': "connect_err",
            'err': err,
            'log_file': xin_error_log,
            'client': client
        };
        redisPool.acquire().then(function(client){
            client.publish(redis_publish_channel, JSON.stringify(error_info));
            redisPool.release(client);
        }).catch(function(err){
            fs.appendFile(xin_error_log, '\r\n<br>' + common_func.formatDate() +"["+ server_ip +"] redis_pool error: "+ JSON.stringify(err), 'utf8', function(err){});
        });
        return false;
    }   
});
//设置连接数为0
redisPool.acquire().then(function(client){
    client.set(xin_socket_connections,"0","EX",expire_time);
    //client.expire(xin_socket_connections,expire_time);
    redisPool.release(client);
}).catch(function(err){
    fs.appendFile(xin_error_log, '\r\n<br>' + common_func.formatDate() +"["+ server_ip +"] redis_pool error: "+ JSON.stringify(err), 'utf8', function(err){});
});

//删除当前在线数据
redisPool.acquire().then(function(client){
    for(var p in app_config.source_list){
        redis_key = xin_socket_connections + "_" + p;
        client.del(redis_key);
    }
    redisPool.release(client);
}).catch(function(err){
    fs.appendFile(xin_error_log, '\r\n<br>' + common_func.formatDate() +"["+ server_ip +"] redis_pool error: "+ JSON.stringify(err), 'utf8', function(err){});
});

//处理socket请求
io.sockets.on('connection', function (socket) {
    
    //用户加入房间、记录用户信息
    redisPool.acquire().then(function(client){
    	var client_info = {
	        'sys_info': true,
	        'key': "client_connect",
	        'log_file': xin_client_log,
	        'clientinfo': socket.getClientInfo()
	    };
        //记录连接数
        client.incr(xin_socket_connections);
        client.publish(redis_publish_channel, JSON.stringify(client_info));
        client.hincrby(xin_socket_session_location,server_ip,1); 
        redisPool.release(client);
    }).catch(function(err){
        fs.appendFile(xin_error_log, '\r\n<br>' + common_func.formatDate() +"["+ server_ip +"] redis_pool error: "+ JSON.stringify(err), 'utf8', function(err){});
    });
    try{
        //加入多个房间
        room_ids = socket.room_ids;
        //console.log("join room_ids:"+room_ids);
        if(typeof(room_ids)=="string" && room_ids.length>1){
            room_list = room_ids.split(",");
            for (var i = 0; i < room_list.length; i++) {
                if(room_list[i] != undefined && room_list[i] !=""){
                   socket.join(socket.source + room_list[i]);  
               }                
            }
            //记录用户链接信息到redis
            var redis_key = xin_socket_connections + "_" + socket.source;
            var redis_today_key = xin_socket_connections + "_today_" + socket.source;
            client_info = socket.getClientInfo();
            client_info['time'] = common_func.formatDate();

            redisPool.acquire().then(function(client){
                client.hset(redis_key,socket.id,JSON.stringify(client_info));
                client.expire(redis_key,expire_time);
                client.hincrby(redis_today_key,socket.username,1);
                client.expire(redis_today_key,expire_time);

                redisPool.release(client);
            }).catch(function(err){
                fs.appendFile(xin_error_log, '\r\n<br>' + common_func.formatDate() +"["+ server_ip +"] redis_pool error: "+ JSON.stringify(err), 'utf8', function(err){});
            });

            //console.log("join room:"+socket.id); 
        }else{
            throw "error room_ids!";   
        }         
    }catch(err){
        socket.emit("sys_error", err);
        var error_info = {
            'sys_info': true,
            'key': "connect_err",
            'err': err,
            'log_file': xin_error_log,
            'client': socket.getClientInfo()
        };
        redisPool.acquire().then(function(client){
            client.publish(redis_publish_channel, JSON.stringify(error_info));
            redisPool.release(client);
        }).catch(function(err){
            fs.appendFile(xin_error_log, '\r\n<br>' + common_func.formatDate() +"["+ server_ip +"] redis_pool error: "+ JSON.stringify(err), 'utf8', function(err){});
        });
    }   
    //user leaves
    socket.on('disconnect', function () {
        //删除用户链接信息
        var redis_key = xin_socket_connections + "_" + socket.source;
        var client_info = {
            'sys_info': true,
            'key': "client_close",
            'log_file': xin_client_log,
            'client': socket.getClientInfo()
        };
        redisPool.acquire().then(function(client){
            //减少连接数
            client.decr(xin_socket_connections);
            client.hdel(redis_key,socket.id);
            client.publish(redis_publish_channel, JSON.stringify(client_info));

            //判断是否有监听用户退出,通知其他客户端 
            if(parseInt(socket.watch_quit) == 1){
                message = {
                    'source': socket.source,
                    'data': {
                        'username': socket.username,
                        'key': 'user_quit',
                        'msg': socket.username + "退出群聊"
                    },
                    'room_id': socket.room_ids,
                    'from_sys': true
                }
                client.publish(redis_publish_channel, JSON.stringify(message)); 
            }
            redisPool.release(client);
        }).catch(function(err){
            fs.appendFile(xin_error_log, '\r\n<br>' + common_func.formatDate() +"["+ server_ip +"] redis_pool error: "+ JSON.stringify(err), 'utf8', function(err){});
        });

    });
    //接收客户端消息，并发布到redis
    socket.on('postMsg', function (data, room_id) {
        //console.log("postMsg:",data,room_id);
        try{
            //验证数据
            if(data == undefined || data == "")
                throw "data can not be null!";
            if(room_id == undefined || room_id == "")
                throw "room_id can not be null!";         
            
            message = {
                'source': socket.source,
                'data': data,
                'room_id': room_id,
                'from_sys': true
            }
            //发布消息到redis频道
            redisPool.acquire().then(function(client){
                client.publish(redis_publish_channel, JSON.stringify(message)); 
                client.hincrby(xin_socket_message_location,server_ip,1); 
                redisPool.release(client);
                
            }).catch(function(err){
                fs.appendFile(xin_error_log, '\r\n<br>' + common_func.formatDate() +"["+ server_ip +"] redis_pool error: "+ JSON.stringify(err), 'utf8', function(err){});
            });         
        }catch(err){
            socket.emit("sys_error", err);
            var error_info = {
                'sys_info': true,
                'key': "postMsg_err",
                'log_file': xin_error_log,
                'client': socket.getClientInfo(),
                'data': data,
                'err':err,
                'room_id': room_id
            };
            redisPool.acquire().then(function(client){
                client.publish(redis_publish_channel, JSON.stringify(error_info));
                redisPool.release(client);
            }).catch(function(err){
                fs.appendFile(xin_error_log, '\r\n<br>' + common_func.formatDate() +"["+ server_ip +"] redis_pool error: "+ JSON.stringify(err), 'utf8', function(err){});
            });
        }        
    });
});

//监听订阅消息
getSubscribeData();
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      
//获取订阅消息
function getSubscribeData() {
     //订阅消息客户端
    redisPool.acquire().then(function(client) {
        redis_subscribe_client = client;
        redis_subscribe_client.on("error", function (err) {
            fs.appendFile(xin_sys_log, '\r\n<br>' + common_func.formatDate() +"["+ server_ip +"] redis_subscribe_client error", 'utf8', function(err){});
        });
        redis_subscribe_client.on("reconnecting", function (err) {
            fs.appendFile(xin_sys_log, '\r\n<br>' + common_func.formatDate() +"["+ server_ip +"] redis_subscribe_client reconnecting", 'utf8', function(err){});
            console.log("redis_subscribe_client reconnecting");
        });
        redis_subscribe_client.on("connect", function () {
            fs.appendFile(xin_sys_log, '\r\n<br>' + common_func.formatDate() +"["+ server_ip +"] redis_subscribe_client connected", 'utf8', function(err){});
            console.log("redis_subscribe_client connected");
        });
        redis_subscribe_client.on("error", function () {
            console.log("redis_subscribe_client error");
        });

        redis_subscribe_client.on("ready", function () {
            //订阅消息
            redis_subscribe_client.subscribe(redis_publish_channel);
            fs.appendFile(xin_sys_log, '\r\n<br>' + common_func.formatDate() +"["+ server_ip +"] subscribe successed!", 'utf8', function(err){});
        });                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 
        redis_subscribe_client.on("error", function (error) {
            fs.appendFile(xin_sys_log, '\r\n<br>' + common_func.formatDate() +"["+ server_ip +"] Redis Error " + error, 'utf8', function(err){});
             //console.log("subscribe error");
        });
        //监听订阅成功事件
        redis_subscribe_client.on("subscribe", function (channel, count) {
            fs.appendFile(xin_sys_log, '\r\n<br>' + common_func.formatDate() +"redis_client subscribed to " + channel + "," + count + "total subscriptions", 'utf8', function(err){});
            //console.log("subscribe success");
        });
        //收到消息后执行回调，message是redis发布的消息
        redis_subscribe_client.on("message", function (channel, message) {
            //console.log("system subscribe receive message!"+message);
            try{
                message_obj = JSON.parse(message); 
                if(message_obj.sys_info != undefined && message_obj.sys_info==true){
                    //系统消息处理
                    var log_file = message_obj.log_file;
                    if(log_file == undefined)
                        throw "log_file is undefined!";
                    delete message_obj.log_file;
                    fs.appendFile(log_file, '\r\n<br>' + common_func.formatDate() +"["+ server_ip +"] " + JSON.stringify(message_obj), 'utf8', function(err){});                    
                }else{
                    //source消息处理
                    room_id = "" + message_obj.room_id;
                    source = message_obj.source;
                    if(room_id != undefined && source != undefined && room_id != "" && source !=""){
                        from_sys = message_obj.from_sys;
                        if(from_sys == undefined){
                            //外部直接向redis发布消息，判断该source是否需要验证签名
                            publish_msg_verify =  app_config.source_list[source].publish_msg_verify;
                            if(publish_msg_verify == undefined)
                                    throw "publish message publish_msg_verify can not be configured! message:"+message;
                            if(publish_msg_verify != undefined && publish_msg_verify ==true){
                                sign = message_obj.sign;
                                if(sign == undefined || sign == "")
                                    throw "publish message sign undefined! message:"+message;
                                var sign_key = app_config.source_list[source].sign_key;
                                if(sign_key == undefined)
                                    throw "publish message source can not be configured! message:"+message;
                                //验证签名
                                var check_sign = md5(source + room_id + message_obj.data + sign_key);
                                if(check_sign != sign){
                                    throw "publish message sign verify failed! message:"+message;
                                }
                            }
                            
                        }
                        //判断该source是否有在线客户端，有才推送
                        var redis_key = xin_socket_connections + "_" + source;
                        redisPool.acquire().then(function(client){
                            client.hgetall(redis_key, function (err, clients) {
                                //console.log("clients:",clients);
                                redisPool.release(client);
                                if(!err && JSON.stringify(clients) != "{}"){
                                    //向指定房间发送消息
                                    room_list = room_id.split(",");
                                    for (var i = 0; i < room_list.length; i++) {
                                        message_obj.room_id = room_list[i];
                                        if(room_list[i] != undefined && room_list[i] != ""){
                                            io.to(source + room_list[i]).emit("newMsg", message_obj); 
                                        }                          
                                    }   
                                }
                            }); 
                        }).catch(function(err){
                            fs.appendFile(xin_error_log, '\r\n<br>' + common_func.formatDate() +"["+ server_ip +"] redis_pool error: "+ JSON.stringify(err), 'utf8', function(err){});
                        });           
                    }else{
                        throw "publish message handle failed! message:"+message;
                    } 
                    //自定义日志文件名称
                    filename = message_obj.filename;
                    if(filename != undefined && common_func.trim(filename) != ""){
                        var save_msg_log = xin_msg_log.replace("msg.log",source +"_"+ common_func.trim(filename));
                    }else{
                        var save_msg_log = xin_msg_log.replace("msg",source + "_msg");
                    }
                    
                    fs.appendFile(save_msg_log, '\r\n<br>' + common_func.formatDate() +"["+ server_ip +"] message:" + message, 'utf8', function(err){});
                }   
            }catch(err){
                fs.appendFile(xin_sys_log, '\r\n<br>' + common_func.formatDate() +"["+ server_ip +"] subscribe message exception:" + err + "message:" + message, 'utf8', function(err){});
            }
        });
        //监听取消订阅事件
        redis_subscribe_client.on("unsubscribe", function (channel, count) {
            fs.appendFile(xin_sys_log, '\r\n<br>' + common_func.formatDate() +"["+ server_ip +"] redis_client unsubscribed from" + channel + ", " + count + " total subscriptions", 'utf8', function(err){});
            //console.log("subscribe unsubscribe");
        });

    }).catch(function(err) {
        fs.appendFile(xin_error_log, '\r\n<br>' + common_func.formatDate() +"["+ server_ip +"] redis_pool error: "+ JSON.stringify(err), 'utf8', function(err){});
    });
}
//重新启动服务，记录环境变量信息
var tmp_app_config = {
	'env': app_config.env,
	'port': app_config.port,
	'log_dir': app_config.log_dir
};
var log_info = {
    'sys_info': true,
    'key': "system_start",
    'log_file': xin_sys_log,
    'app_config' : tmp_app_config,
    'server_ip': server_ip
};
redisPool.acquire().then(function(client){
    client.publish(redis_publish_channel, JSON.stringify(log_info));
    redisPool.release(client);
}).catch(function(err){
    fs.appendFile(xin_error_log, '\r\n<br>' + common_func.formatDate() +"["+ server_ip +"] redis_pool error: "+ JSON.stringify(err), 'utf8', function(err){});
});
