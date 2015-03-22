framework.helpers.giaHienTai = function(coPhieu){
	return coPhieu[10] != 0 ? coPhieu[10] : coPhieu[1];
}

framework.helpers.numberWithCommas = function(x) {
    var parts = x.toString().split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return parts.join(".");
}