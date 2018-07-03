# node-socket-im -> Node+Express+Socket.IO 服务端多实例消息共享及时通信项目
------
应用：

> * 实时数据接收
> * IM消息群聊
> * 客户端浏览器信息采集、用户在线情况、浏览记录跟踪
> * 程序打点远程调试，类似开源项目socketlog
> * 后台项目逻辑操作后、页面数据及时刷新
> * 其他待补充...

------
## 前端接入：
#### 创建连接：
1、引入静态资源md5.js,xin_node.min.js, 附件可下载
```javascript
<script src="js/md5.js"></script>
<script src="js/node_im.min.js"></script>
```
2、生成签名、拼接node服务连接地址 socket_server_url 如：
```javascript
var socket_server_url = "http://127.0.0.1:4000?userid=1305&username=spring&source=xxx_system&room_ids=receive_repeat_verify_1305%2Cwait_repeat_verify_list&sign=7778a73e924813a2d5ebb1db39abf2c4&ext_info=";
```
##### 注：
      a、参数userid、username、source、room_ids、sign 都是必传的,ext_info是非必传的,可传一些客户端信息，或其他附加信息
      b、sign生成方式： sign = md5(source + room_ids + sign_key);
      c、source及相应的sign_key可发邮件申请
      d、可监听多个room_id，可用逗号隔开room_id,如："room001,room002,room003"

#### 3、创建会话：XIN_NODE.init(socket_server_url, node_callback_config); 
##### 注：
```js
     socket_server_url 为拼接好的node服务连接地址 [必须]
     node_callback_config = {
                  'receive_message_callback': function(message){}, //接收消息回调 [非必须]
                  'connected_callback': function(socket){}, //会话连接后回调 [非必须]
                  'sys_error_callback': function(err){}, //系统返回错误信息回调 [非必须]
                  'max_attemptNumber': 10, //失败重连最大次数，默认为10,超出重连最大次数，该会话将自动关闭 [非必须]
                  'reconnect_attempt_failed_callback': function(){} //超过失败重连最大次数回调 [非必须]
           } [必须]
```
#### 4、接收消息：
##### 1.设置receive_message_callback回调函数进行回调，如:
```js
         var node_callback_config = {
                 'receive_message_callback': function(message){
                        console.log(message);
                 }
         };
         XIN_NODE.init(socket_server_url, node_callback_config);
```
    注：接收的消息message为json对象数据，如：{"source":"xxx_system","data":{"factory_count":47,"cover_city_count":14},"room_id":"10000020"}

#### 5、推送消息：
##### 1、XIN_NODE.send_msg(data,room_ids)
注：数据格式：data建议为json对象，也可以是普通的数据格式; 消息可以发送到单个或多个房间，如多个room_id，可用逗号隔开, 如："room001,room002,room003"

#### 6、异常处理：
##### 1、设置sys_error_callback, reconnect_attempt_failed_callback异常情况回调函数处理

------
## 后端接入：
#### 推送消息：
##### 1、http方式
接口地址：http://127.0.0.1:4000/api/notify
请求方式：POST
请求参数：

 字段名称  | 数据类型   |  必要  | 注释  <br>
source  string  是 消息来源<br>
data  string  是 发送的消息，如{"factory_count":47,"cover_city_count":12}<br>
sign  string  是 签名生成方式： sign = md5(source + room_id + data + sign_key)<br>
room_id string  是 房间号，多个可用逗号隔开,如："room001,room002,room003"<br>
filename  string  否 保存的日志文件名称，如test.log<br>


接口返回：json格式，code为1表示消息发送成功，其他为失败{"code":1,"msg":"message notify successed!","data":""}

#### php demo:
```php
 /** * 模拟post进行url请求 * @param string $url * @param string $param */
 function request_post($url = '', $param = '') 
 { 
 	if (empty($url) || empty($param)) { 
		return false; 
	} 
	$postUrl = $url; 
	$curlPost = $param; 
	$ch = curl_init();//初始化curl
        curl_setopt($ch, CURLOPT_URL,$postUrl);//抓取指定网页
        curl_setopt($ch, CURLOPT_HEADER, 0);//设置header
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);//要求结果为字符串且输出到屏幕上
        curl_setopt($ch, CURLOPT_POST, 1);//post提交方式
        curl_setopt($ch, CURLOPT_POSTFIELDS, $curlPost); 
	$data = curl_exec($ch);//运行curl
        curl_close($ch); 
	return $data; 
 }
$url = "http://127.0.0.1:4000/api/notify";
$source = "demo";
$sign_key = "try4dfs%#fs!#$2334ds(%B)";
$room_id = "monitor_room";

$data = time();
$sign = md5($source . $room_id . $data . $sign_key);

$fields = [
'source' => $source,
'room_id' => $room_id,
'data' => $data,
'sign' => $sign
];
$res = request_post($url, http_build_query($fields));
var_dump($res);
```
前端ajax post请求demo:
```js
var source = "demo";
var sign_key = "try4dfs%#fs!#$2334ds(%B)";
var room_ids = "room1,room2,room3,room4";
var api_url = "http://127.0.0.1:4000/api/notify";
var send_data = "test";
var send_sign = md5(source + room_ids + send_data + sign_key);
//推送的消息
var message = {
"source":source,
"data":send_data,
"sign":send_sign,
"room_id":room_ids
};
$.post(api_url,message,function(res){
console.log(res);
},"json");
```
Nodejs服务端请求demo: 需要安装md5和request模块
```js
var request = require('request'),
md5 = require('md5'),
source = "demo",
sign_key = "try4dfs%#fs!#$2334ds(%B)",
room_ids = "room1,room2,room3,room4",
api_url = "http://127.0.0.1:4000/api/notify",
send_data = "test",
send_sign = md5(source + room_ids + send_data + sign_key);

//推送的消息
var message = {
"source":source,
"data":send_data,
"sign":send_sign,
"room_id":room_ids
};
//发送post请求
request.post({url:api_url, form:message}, function(error, response, body) {
if (!error && response.statusCode == 200) {
console.log(body);
}
});
```
------
## 前端远程调试
引入node_im_remote_debug.js文件
demo:
前端界面接入：
```js
<script src="js/node_im_remote_debug.js"></script>
<script>
setInterval(function(){
var w = document.documentElement.clientWidth || document.body.clientWidth;
var h = document.documentElement.clientHeight || document.body.clientHeight;
data = {width:w,height:h};
console.log(data);
},2000);
</script>
```
远程调试显示：
```js
<ul id="messages"></ul>
<script src="js/node_im.min.js"></script>
<script src="https://cdn.bootcss.com/jquery/2.2.3/jquery.min.js"></script>
<script>
var socket_server_url = "http://127.0.0.1:4000?userid=0000&username=demo&source=remote_debug&room_ids=console-log&sign=5b092ffd2f7bcd3eddc9a7655600a998&ext_info=";
var node_callback_config = {
'receive_message_callback': function(message){
$('#messages').append($('<li>').text(JSON.stringify(message)));
}
};
XIN_NODE.init(socket_server_url, node_callback_config); 
</script>
```
