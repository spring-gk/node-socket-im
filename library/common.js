'use strict';
var common_func = {
    formatDate: function(){
    	//获取当前时间
    	var date = new Date();
	    var seperator1 = "-";
	    var seperator2 = ":";
	    var month = date.getMonth() + 1;
	    var strDate = date.getDate();
	    if (month >= 1 && month <= 9) {
	        month = "0" + month;
	    }
	    if (strDate >= 0 && strDate <= 9) {
	        strDate = "0" + strDate;
	    }
	    var currentdate = date.getFullYear() + seperator1 + month + seperator1 + strDate
	        + " " + date.getHours() + seperator2 + date.getMinutes()
	        + seperator2 + date.getSeconds();
	    
	    return currentdate;
    },
    getDate: function(){
    	//获取当前时间
    	var date = new Date();
	    var seperator1 = "-";
	    var seperator2 = ":";
	    var month = date.getMonth() + 1;
	    var strDate = date.getDate();
	    if (month >= 1 && month <= 9) {
	        month = "0" + month;
	    }
	    if (strDate >= 0 && strDate <= 9) {
	        strDate = "0" + strDate;
	    }
	    var currentdate = date.getFullYear() + seperator1 + month + seperator1 + strDate;
	    
	    return currentdate;
    },
    getIPAdress: function(){
    	//获取IP
    	var interfaces = require('os').networkInterfaces();  
	    for(var devName in interfaces){  
	          var iface = interfaces[devName];  
	          for(var i=0;i<iface.length;i++){  
	               var alias = iface[i];  
	               if(alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal){  
	                     return alias.address;  
	               }  
	          }  
	    }  
    },
    createFolder: function(dirpath) {
    	//创建文件夹
    	var fs = require('fs');
        if (!fs.existsSync(dirpath)) {
            fs.mkdirSync(dirpath);
            console.log(dirpath + " Folder created!");
     	} 
	},
	trim: function(str){
		return str.replace(/(^\s*)|(\s*$)/g, "");
	}
};
module.exports=common_func;