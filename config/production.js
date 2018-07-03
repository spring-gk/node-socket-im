'use strict';
/**
 * 开发环境配置文件
 */
var config = {
    env: 'production', //环境名称
    port: 4000,         //服务端口号
    redis_config: {     //redis配置
        'host': '172.16.20.62',
        'port': 6380
    },
    log_dir: "/data1/logs/app/nodejs/node.xin.com/", //日志目录
    source_list:{       //消息来源配置
        'demo': {'sign_key':'65(&d4dfsqw!#$2qwds(%B)','publish_msg_verify':true},
        'remote_debug': {'sign_key':'rs#&(s%sdsdfs!#$q34ds(%B)','publish_msg_verify':true}
    }
};
module.exports=config;