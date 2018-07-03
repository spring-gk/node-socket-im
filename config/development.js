'use strict';
/**
 * 开发环境配置文件2
 */
var config = {
    env: 'development', //环境名称
    port: 4000,         //服务端口号
    redis_config: {     //redis配置
        'host': '172.16.98.67',
        'port': 6481
    },
    log_dir: "/data1/logs/app/nodejs/node.xx.com/", //日志目录
    source_list:{       //消息来源配置
        'demo': {'sign_key':'try4dfs%#fs!#$2334ds(%B)','publish_msg_verify':true},
        'remote_debug': {'sign_key':'5iwdf$%sdfss!#$2334ds(%B)','publish_msg_verify':true}
    }
};
module.exports=config;