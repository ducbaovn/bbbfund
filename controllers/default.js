exports.install = function() {
    F.route('/', view_index, {timeout:false});
    F.route('/admin', view_admin, {timeout:false});
    // or
    // F.route('/');
};

function view_index() {
    var self = this;
    displayData()
    .then(insertDB)
    .then(drawGraph)
    .done(function(model){
    	self.view('index', model);
    });
}

function view_admin() {
    var self = this;
    if (self.query.submit) {
        giaoDich(self.query)
        .then(displayData)
        .done(function(model){
			self.view('admin', model);
        });
    }
    else {
        displayData()
        .done(function(model){
            self.view('admin', model);
        });
    }
}

var Q = require('q');
var request = require('request');
var httpGet = Q.nfbind(request);
var dateFormat = require('../definitions/dateFormat.js');
var mysql = require('mysql');
var pool = mysql.createPool({
     connectionLimit: 66,
     host: 'myhost',
     user: 'username',
     password: 'pass',
     database: 'db'
});
var query = Q.nbind(pool.query, pool);

function getDataList(data) {
    var dataStr = data.split('|');
    var dataList = [];
    if (dataStr[dataStr.length - 1] === '') dataStr.pop();
    dataStr.sort();
    for (var i = 0; i < dataStr.length; i++) {
        dataList.push(dataStr[i].split(','));
    }
    return dataList;
}

function getHSCpromise(data){
    return Q.all([httpGet(data.sanHCM),httpGet(data.sanHN)]).spread(function(hcmRes, hnRes){
        var vnData = getDataList(hcmRes[1].split('^')[0]);
        var bbbCPData = getDataList(hcmRes[1].split('^')[1].concat(hnRes[1].split('^')[1]));
        hscData = {
            vnData: vnData,
            bbbCPData: bbbCPData
        };
        return {hscData: hscData, lastDB: data.lastDB, yesterdayDB: data.yesterdayDB};
    });
}

function getLastDatabase(){
    var BBB_CPquery = 'SELECT MA_CP, SAN, SO_LUONG, GIA, GIA_MUA FROM bbb_cp WHERE NGAY=(SELECT MAX(NGAY) FROM bbb_cp) AND SO_LUONG!=0';
    var TAI_SANquery = 'SELECT TIEN_MAT, CO_PHIEU, LOI_NHUAN_THAT FROM tai_san WHERE NGAY=(SELECT MAX(NGAY) FROM tai_san)';
    var CHI_SOquery = 'SELECT NHOM_CP, CHISO FROM chi_so WHERE NGAY=(SELECT MAX(NGAY) FROM chi_so)';
    return Q.all([query(BBB_CPquery), query(TAI_SANquery), query(CHI_SOquery)]).spread(function(rows1, rows2, rows3){
        return {
            BBB_CP: rows1[0],
            TAI_SAN: rows2[0],
            CHI_SO: rows3[0]
        }
    });
}

function getYesterdayDatabase(){
    var now = new Date();
    var yesterday = new Date(now.getTime() - 86400000);
    var yesterdayStr = dateFormat(yesterday, 'yyyy-mm-dd');
    var BBB_CPquery = 'SELECT MA_CP, SO_LUONG, GIA, GIA_MUA FROM bbb_cp WHERE NGAY="'+yesterdayStr+'"';
    var TAI_SANquery = 'SELECT TIEN_MAT, CO_PHIEU, LOI_NHUAN_THAT FROM tai_san WHERE NGAY="'+yesterdayStr+'"';
    var CHI_SOquery = 'SELECT NHOM_CP, CHISO FROM chi_so WHERE NGAY="'+yesterdayStr+'"';
    return Q.all([query(BBB_CPquery), query(TAI_SANquery), query(CHI_SOquery)]).spread(function(rows1, rows2, rows3){
        return {
            BBB_CP: rows1[0],
            TAI_SAN: rows2[0],
            CHI_SO: rows3[0]
        }
    });
}

function drawGraph(data){
    var BBBquery = 'SELECT CHISO, NGAY FROM chi_so WHERE NHOM_CP="BBB" AND dayofweek(NGAY)!=1 AND dayofweek(NGAY)!=7';
    var VNquery = 'SELECT CHISO, NGAY FROM chi_so WHERE NHOM_CP="VN" AND dayofweek(NGAY)!=1 AND dayofweek(NGAY)!=7';
    var VN30query = 'SELECT CHISO, NGAY FROM chi_so WHERE NHOM_CP="VN30" AND dayofweek(NGAY)!=1 AND dayofweek(NGAY)!=7';
    return Q.all([query(BBBquery), query(VNquery), query(VN30query)]).spread(function(rows1, rows2, rows3){
        var d = Q.defer();
        var bbbGraph = BBBPlotlyData(rows1[0]);
        var VNGraph = VNPlotlyData(rows2[0]);
        var VN30Graph = VN30PlotlyData(rows3[0]);
        var plotly = require('plotly')("ducbaovn", "j0c7mhejlt");
        var layout = {
            title: "BBBIndex Graph",
            xaxis: {title: "Ngay", showgrid: true, showticklabels: false},
            yaxis: {title: "Index"}
        };
        var graphOpt = {layout: layout, filename: "BBB Graph ver0.1", fileopt: "overwrite"};
        plotly.plot([bbbGraph, VNGraph, VN30Graph], graphOpt, function (err, msg) {
            d.resolve(data);
        });
        return d.promise;
    });
}

function BBBPlotlyData(rows){
    var xData = [];
    var yData = [];
    for (var i = 0; i < rows.length; i++) {
        xData.push(dateFormat(rows[i].NGAY, 'm/d/yy'));
        yData.push(rows[i].CHISO);
    }
    return {x: xData, y: yData, type: "scatter", name: "BBBIndex"};
}
function VNPlotlyData(rows){
    var xData = [];
    var yData = [];
    for (var i = 0; i < rows.length; i++) {
        xData.push(dateFormat(rows[i].NGAY, 'm/d/yy'));
        yData.push(rows[i].CHISO/574.3*100);
    }
    return {x: xData, y: yData, type: "scatter", name: "VNIndex"};
}

function VN30PlotlyData(rows){
    var xData = [];
    var yData = [];
    for (var i = 0; i < rows.length; i++) {
        xData.push(dateFormat(rows[i].NGAY,'m/d/yy'));
        yData.push(rows[i].CHISO/615.7*100);
    }
    return {x: xData, y: yData, type: "scatter", name: "VN30Index"};
}

function tongVonCP(data) {
    var sum = 0;
    for (var i = 0; i < data.length; i++) {
        sum += data[i]['SO_LUONG'] * data[i]['GIA_MUA'];
    }
    return sum;
}

function tongGiaTriHienTai(lastData, hscData) {
    var sum = 0;
    for (var i = 0; i < lastData.length; i++) {
        sum += lastData[i]['SO_LUONG'] * giaHienTai(hscData[i]);
    }
    return sum;
}

function giaHienTai(data) {
    return data[10] != 0 ? data[10] : data[1];
}

function numberWithCommas(x) {
    var parts = x.toString().split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return parts.join(".");
}

function displayData(){
    return Q.all([getLastDatabase(), getYesterdayDatabase()]).spread(function(lastDB, yesterdayDB){
        var hcmMaCP='';
        var hnMaCP='';
        for (var i = 0; i < lastDB['BBB_CP'].length; i++){
            if (lastDB['BBB_CP'][i].SAN === 'HCM')
                hcmMaCP += lastDB['BBB_CP'][i].MA_CP + '|';
            else hnMaCP += lastDB['BBB_CP'][i].MA_CP + '|';
        }
        hcmMaCP = hcmMaCP.slice(0, -1);
        hnMaCP = hnMaCP.slice(0, -1);
        var hnOptions = {
            uri: 'http://priceonline.hsc.com.vn/hnpriceonline/Process.aspx?Type=MS',
            encoding: 'utf8',
            method: 'GET',
            headers: {cookie: "_ga=GA1.3.745813521.1425554758; _gat=1; ASP.NET_SessionId=swbijimsj4aova2dfbmrannw; _kieHNXSF=" + hnMaCP}
        };
        //gyks1s45pqzlt3nibafbfj55
        var hcmOptions = {
            uri: 'http://priceonline.hsc.com.vn/Process.aspx?Type=MS',
            encoding: 'utf8',
            method: 'GET',
            headers: {cookie: "_ga=GA1.3.745813521.1425554758; _gat=1; ASP.NET_SessionId=swbijimsj4aova2dfbmrannw; _kieHoSESF=" + hcmMaCP}
        };
        var data = {lastDB: lastDB, yesterdayDB: yesterdayDB, sanHCM: hcmOptions, sanHN: hnOptions};
        return getHSCpromise(data).then(function(allData){
            var hscData = allData.hscData;
            var lastDB = allData.lastDB;
            var yesterdayDB = allData.yesterdayDB;
            for (var i = 0; i < hscData.bbbCPData.length; i++){
            	hscData.bbbCPData[i][10] = giaHienTai(hscData.bbbCPData[i]);
            }
            for (var i = 0; i < lastDB['BBB_CP'].length; i++){
                lastDB['BBB_CP'][i].GIA = giaHienTai(hscData['bbbCPData'][i]);
                lastDB['BBB_CP'][i].phanBo = lastDB['BBB_CP'][i]['SO_LUONG']*giaHienTai(hscData['bbbCPData'][i])/tongGiaTriHienTai(lastDB['BBB_CP'], hscData['bbbCPData'])*100;
                lastDB['BBB_CP'][i].phanTram = (giaHienTai(hscData['bbbCPData'][i])/lastDB['BBB_CP'][i]['GIA_MUA']-1)*100;
                lastDB['BBB_CP'][i].giaTri = lastDB['BBB_CP'][i]['SO_LUONG']*giaHienTai(hscData['bbbCPData'][i]);
            }
            var bangCoPhieu = {
                bangCP: lastDB['BBB_CP'],
                vonCP: tongVonCP(lastDB['BBB_CP']),
                tongGia : tongGiaTriHienTai(lastDB['BBB_CP'], hscData['bbbCPData']),
                tienMat : lastDB['TAI_SAN'][0]['TIEN_MAT'],
               	loiNhuan : tongGiaTriHienTai(lastDB['BBB_CP'], hscData['bbbCPData']) - tongVonCP(lastDB['BBB_CP']) + lastDB['TAI_SAN'][0]['LOI_NHUAN_THAT'],
                loiNhuanThat: lastDB['TAI_SAN'][0]['LOI_NHUAN_THAT'],
                phanTramLoiNhuan : ((tongGiaTriHienTai(lastDB['BBB_CP'], hscData['bbbCPData'])+lastDB['TAI_SAN'][0]['LOI_NHUAN_THAT'])/tongVonCP(lastDB['BBB_CP'])-1)*100
            }
            var currentBBBIndex = yesterdayDB['CHI_SO'][0]['CHISO']*(lastDB['TAI_SAN'][0]['TIEN_MAT']+tongGiaTriHienTai(lastDB['BBB_CP'], hscData['bbbCPData']))/(yesterdayDB['TAI_SAN'][0]['TIEN_MAT']+yesterdayDB['TAI_SAN'][0]['CO_PHIEU']);
            var bangSoSanh = {
                BBBIndex : currentBBBIndex.toFixed(3),
                VNIndex : hscData['vnData'][0][3],
                VN30Index : hscData['vnData'][1][3],
                phanTramBBB : (currentBBBIndex/yesterdayDB['CHI_SO'][0]['CHISO']-1)*100,
                phanTramVN : (hscData['vnData'][0][3]/yesterdayDB['CHI_SO'][1]['CHISO']-1)*100,
                phanTramVN30 : (hscData['vnData'][1][3]/yesterdayDB['CHI_SO'][2]['CHISO']-1)*100    
            }
            return {bang1: hscData.bbbCPData, bang2: bangCoPhieu, bang3: bangSoSanh};
        });
    });
}

function insertDB(data){
    var now = new Date();
    var nowStr = dateFormat(now,'yyyy-mm-dd');
    var insertArr=[];
    for (var i = 0; i < data.bang2.bangCP.length; i++) {
        pool.query('INSERT INTO bbb_cp VALUES ("' + data.bang2.bangCP[i].MA_CP + '", "' + data.bang2.bangCP[i].SAN + '", ' + data.bang2.bangCP[i].SO_LUONG + ', ' + data.bang2.bangCP[i].GIA_MUA + ', ' + data.bang2.bangCP[i].GIA + ', "' + nowStr + '") ON DUPLICATE KEY UPDATE SO_LUONG=' + data.bang2.bangCP[i].SO_LUONG + ', GIA=' + data.bang2.bangCP[i].GIA);
    }
    pool.query('INSERT INTO tai_san VALUES (' + data.bang2.tienMat + ', ' + data.bang2.tongGia +  ', '+data.bang2.loiNhuanThat+', "' + nowStr + '") ON DUPLICATE KEY UPDATE CO_PHIEU=' + data.bang2.tongGia);
    pool.query('INSERT INTO chi_so VALUES ("BBB", "' + nowStr + '", ' + data.bang3.BBBIndex + ') ON DUPLICATE KEY UPDATE CHISO=' + data.bang3.BBBIndex);
    pool.query('INSERT INTO chi_so VALUES ("VN", "' + nowStr + '", ' + data.bang3.VNIndex + ') ON DUPLICATE KEY UPDATE CHISO=' + data.bang3.VNIndex);
    return query('INSERT INTO chi_so VALUES ("VN30", "' + nowStr + '", ' + data.bang3.VN30Index + ') ON DUPLICATE KEY UPDATE CHISO=' + data.bang3.VN30Index).then(function(insertData){
        return data;
    });
}

function giaoDich(data){
    var now = new Date();
    var yesterday = new Date(now.getTime() - 86400000);
    nowStr = dateFormat(now, 'yyyy-mm-dd');
    yesterdayStr = dateFormat(yesterday, 'yyyy-mm-dd');
    if (data.submit === "Mua") {
        return Q.all([query('INSERT INTO bbb_cp VALUES ("'+data.maCP+'","'+data.maSan+'",'+data.soLuong+','+data.gia+','+data.gia+',"'+nowStr+'") ON DUPLICATE KEY UPDATE SO_LUONG=SO_LUONG+'+data.soLuong+', GIA_MUA=(SO_LUONG*GIA_MUA+'+data.soLuong+'*'+data.gia+')/(SO_LUONG+'+data.soLuong+')'),
            query('UPDATE tai_san SET TIEN_MAT=TIEN_MAT-CEIL('+(data.soLuong*data.gia)*1.0035+') WHERE NGAY="'+nowStr+'"')]);
    }
    else if (data.submit === "Bán") {
        return query('SELECT GIA_MUA FROM bbb_cp WHERE NGAY="'+nowStr+'" AND MA_CP='+data.maCP).then(function(rows){
            return Q.all([query('UPDATE bbb_cp SET SO_LUONG=SO_LUONG-'+data.soLuong+' WHERE MA_CP="'+data.maCP+'" AND NGAY="'+nowStr+'"'),query('UPDATE tai_san SET TIEN_MAT=TIEN_MAT+'+(data.soLuong*data.gia)*0.9955+', LOI_NHUAN_THAT=LOI_NHUAN_THAT+'+(data.soLuong*data.gia*0.9955-data.soLuong*rows[0].GIA_MUA)+' WHERE NGAY="'+nowStr+'"')]);
        })
        
    }
    else if (data.submit === "Gửi") {
        return query('UPDATE tai_san SET TIEN_MAT=TIEN_MAT+'+data.tienMat+' WHERE NGAY="'+nowStr+'" OR NGAY="'+yesterdayStr+'"');
    }
    else if (data.submit === "Rút") {
        return query('UPDATE tai_san SET TIEN_MAT=TIEN_MAT-'+data.tienMat+' WHERE NGAY="'+nowStr+'" OR NGAY="'+yesterdayStr+'"');
    }else if (data.submit === "Nhận") {
        return query('UPDATE tai_san SET TIEN_MAT=TIEN_MAT+'+data.tienMat+', LOI_NHUAN_THAT=LOI_NHUAN_THAT+'+data.tienMat+' WHERE NGAY="'+nowStr+'"');
    }
    return;
}