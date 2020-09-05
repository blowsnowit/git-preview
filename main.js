class Git{

    /**
     * 获取文件blob
     * @param owner
     * @param repo
     * @param branches
     * @param path
     * @return {Blob && url} 特殊处理 返回一个url  为了兼容cdn加速模式
     */
    getBlob(owner,repo,branches,path){}

    //通过文件地址获取blob
    getBlobByUrl(url){
        let result = this.parseUrl(url);
        console.log('git.getblob',result[1],result[2],result[3],result[4]);
        return this.getBlob(result[1],result[2],result[3],result[4]);
    }

    //解析常见的git 文件地址
    parseUrl(url){
        //https://github.com/forks-test/test/blob/master/190318214226685784.mp4
        //https://github.com/forks-test/test/blob/test/190318214226685784.mp4
        let pattern = /\/\/.*?\/(.*?)\/(.*?)\/blob\/(.*?)\/(.*?)$/;
        let result = pattern.exec(url);
        if (!result || result.length !== 5 ){
            throw new Error("解析失败");
        }
        return result;
    }

    /**
     * 自动识别获取git实例对象
     * @param url
     * @returns {Git}
     */
    static getGitAuto(url){
        if (url.indexOf("github") !== -1){
            return new Github();
        }else if (url.indexOf("gitee") !== -1){
            return new Gitee();
        }
    }
}

class Github extends Git{

    // 获取文件blob内容
    async getBlob(owner,repo,branches,path){
        let file = null;
        try {  //防止获取失败
            file = await this.findFileInfoByTree(owner,repo,branches,path);
        }catch (e){
            console.log('从github读取源文件失败');
        }

        if (file && file.size > 50 * 1024 * 1024){  //如果大于50m  从github直接获取 否则可以从 jsdelivr加速获取
            return this.getBlobByGithub(owner,repo,branches,path,file.sha);
        }else{
            return this.getBlobByJsdelivr(owner,repo,branches,path);
        }
    }

    // 通过 Jsdelivr cdn 告诉获取，缓存严重
    // jsdelivr 最大文件大小 50m
    getBlobByJsdelivr(owner,repo,branches,path){
        return new Promise(function (resolve){
            //利用 jsdelivr 的加速获取  建议加个随机值防止缓存
            let url = "https://cdn.jsdelivr.net/gh/"+owner+"/"+repo+"@"+branches+"/"+path ;
            var xhr          = new XMLHttpRequest();
            xhr.open("get", url, true);
            xhr.responseType = "blob";
            xhr.onload       = function() {
                if (this.status == 200) {
                    let blob = this.response;
                    blob.url = url;
                    resolve(blob);
                }
            };
            xhr.send();
        })
    }

    async getBlobByGithub(owner,repo,branches,path,hash){
        // 从github获取，但是国内速度过慢
        // 建议使用hash缓存一下数据，没地方存 ！！！....

        let url = "https://api.github.com/repos/"+owner+"/"+repo+"/git/blobs/"+hash
        let res = await Util.request(url);

        let blob = Util.base64ToBlob(res.content,Util.getFileMime(path));
        blob.url = URL.createObjectURL(blob);
        return blob;
    }

    /**
     * 寻找文件信息从文件树中获取
     * @param owner
     * @param repo
     * @param branches
     * @param path
     * @returns {Promise<null|*>}
     */
    async findFileInfoByTree(owner,repo,branches='master',path){
        // https://api.github.com/repos/forks-test/test/git/trees/master?recursive=1
        let res = await Util.request("https://api.github.com/repos/"+owner+"/"+repo+"/git/trees/"+branches+"?recursive=1");
        for(let item of res.tree){
            if (item.path === path){
                return item;
            }
        }
        return null;
    }
}

class Gitee extends Git{
    async getBlob(owner, repo, branches, path) {
        let url = "https://gitee.com/api/v5/repos/"+owner+"/"+repo+"/contents/" + path

        let res = await Util.request(url);

        let blob = Util.base64ToBlob(res.content,Util.getFileMime(path));
        blob.url = URL.createObjectURL(blob);
        return blob;
    }
}

class Util{
    /**
     * 简单的请求方法
     * @param url
     * @returns {Promise<unknown>}
     */
    static request(url){
        return new Promise(function (resolve,reject){
            $.get(url,function (res){
                resolve(res);
            },"JSON").fail(function (err){
                reject(err);
            });
        })
    }

    /**
     * base64转blob
     * @param b64data
     * @param contentType
     * @param sliceSize
     * @returns {Blob}
     */
    static base64ToBlob (b64data = '', contentType = '', sliceSize = 512) {
        // 使用 atob() 方法将数据解码
        let byteCharacters = atob(b64data);
        let byteArrays = [];
        for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
            let slice = byteCharacters.slice(offset, offset + sliceSize);
            let byteNumbers = [];
            for (let i = 0; i < slice.length; i++) {
                byteNumbers.push(slice.charCodeAt(i));
            }
            // 8 位无符号整数值的类型化数组。内容将初始化为 0。
            // 如果无法分配请求数目的字节，则将引发异常。
            byteArrays.push(new Uint8Array(byteNumbers));
        }
        return new Blob(byteArrays, {
            type: contentType
        })
    }

    /**
     * 通过文件后缀获取mime，注意不准确
     * @param path
     * @param defaultMime
     * @returns {string|*}
     */
    static getFileMime(path,defaultMime="text/plain"){
        let mimes = {
            "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "doc": "application/msword",
            "pdf": "application/pdf",
            "rtf": "application/rtf",
            "xls": "application/vnd.ms-excel",
            "ppt": "application/vnd.ms-powerpoint",
            "swf": "application/x-shockwave-flash",
            "mid": "audio/midi",
            "midi": "audio/midi",
            "kar": "audio/midi",
            "mp3": "audio/mpeg",
            "ogg": "audio/ogg",
            "m4a": "audio/x-m4a",
            "ra": "audio/x-realaudio",
            "gif": "image/gif",
            "jpeg": "image/jpeg",
            "jpg": "image/jpeg",
            "png": "image/png",
            "tif": "image/tiff",
            "tiff": "image/tiff",
            "wbmp": "image/vnd.wap.wbmp",
            "ico": "image/x-icon",
            "jng": "image/x-jng",
            "bmp": "image/x-ms-bmp",
            "svg": "image/svg+xml",
            "svgz": "image/svg+xml",
            "webp": "image/webp",
            "css": "text/css",
            "html": "text/html",
            "htm": "text/html",
            "shtml": "text/html",
            "txt": "text/plain",
            "xml": "text/xml",
            "3gpp": "video/3gpp",
            "3gp": "video/3gpp",
            "mp4": "video/mp4",
            "mpeg": "video/mpeg",
            "mpg": "video/mpeg",
            "mov": "video/quicktime",
            "webm": "video/webm",
            "flv": "video/x-flv",
            "m4v": "video/x-m4v",
            "wmv": "video/x-ms-wmv",
            "avi": "video/x-msvideo",
            "zip": "application/x-zip-compressed",
            "tar": "application/x-tar",
            "tgz": "application/x-compressed",
            "rar": "application/x-rar-compressed",
        }
        let search = path.substr(path.lastIndexOf(".") + 1);
        if (mimes[search]){
            return mimes[search];
        }
        return defaultMime;
    }
}

class View{

    static render(blob){
        console.log('render',blob);
        if (blob.type.indexOf("video") !== -1 || blob.type === 'application/vnd.apple.mpegurl'){
            this.renderVideo(blob);
        }else if (blob.type.indexOf("text") !== -1){
            this.renderText(blob);
        }else if (blob.type.indexOf("image") !== -1){
            this.renderImage(blob);
        }else{
            this.createIframe(URL.createObjectURL(blob))
        }
    }

    //渲染视频
    static renderVideo(blob){
        let dom = $(`<video-js id='example-video' class='vjs-default-skin' controls style='width: 100%;height: 100%;'></video-js>`)
        document.body.appendChild(dom[0]);

        var player = window.player = videojs('example-video');

        player.src({
            src: blob.url,
            type: blob.type
        });
    }

    //渲染文本
    static renderText(blob){
        //输出文本内容
        var dom = document.createElement('pre');
        blob.text().then(function (text){
            console.log(text);
            dom.innerText = text;
            document.body.appendChild(dom);
        });
    }

    //渲染图片
    static renderImage(blob){
        var dom = document.createElement('img');
        dom.src= blob.url;
        document.body.appendChild(dom);
    }

    static createIframe(src){
        var iframe = document.createElement('iframe');
        iframe.src= src;
        iframe.width = '100%';
        iframe.height = '100%';
        iframe.frameBorder = '0';
        document.body.appendChild(iframe);
    }
}


function load(url){
    Git.getGitAuto(url).getBlobByUrl(url).then(function (blob){
        View.render(blob);
    })
}


//尝试从地址中获取
let pattern = /.*?\/[?#](.*?)$/;
let result = pattern.exec(location.href);
if (result && result.length >= 2){
    load(result[1]);
}


