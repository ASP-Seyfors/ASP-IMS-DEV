async function openActiveShipmentsHub() {
    let modal = document.getElementById('shipmentTrackingModal');
    let listIn = document.getElementById('trackIncomingList');
    let listOut = document.getElementById('trackOutgoingList');
    
    listIn.innerHTML = "<p>Loading...</p>";
    listOut.innerHTML = "<p>Loading...</p>";
    modal.style.display = "block";

    try {
        let res = await fetch(`${SessionManager.getActiveArchiveUrl()}?action=GET_PENDING_SHIPMENTS`);
        let data = await res.json();
        
        const buildHtml = (arr) => {
            if (arr.length === 0) return "<p style='color:#777; font-style:italic;'>No pending shipments.</p>";
            return arr.map(s => {
                let dStr = new Date(s.date).toLocaleDateString();
                let link = s.tracking ? `<a href="https://www.fedex.com/fedextrack/?trknbr=${s.tracking}" target="_blank" style="color:#0277bd; font-weight:bold; text-decoration:none;">Track: ${s.tracking}</a>` : "No Tracking #";
                return `<div style="background:#fff; border:1px solid #ddd; padding:8px; margin-bottom:8px; border-radius:4px;">
                            <div style="font-weight:bold;">${s.partner} <span style="float:right; color:#777; font-size:0.75rem;">${dStr}</span></div>
                            <div style="color:#555;">PO: ${s.po}</div>
                            <div style="margin-top:4px;">${link}</div>
                        </div>`;
            }).join('');
        };

        listIn.innerHTML = buildHtml(data.incoming);
        listOut.innerHTML = buildHtml(data.outgoing);
        lucide.createIcons();
    } catch (err) {
        listIn.innerHTML = `<p style="color:red;">Error loading shipments.</p>`;
        listOut.innerHTML = "";
    }
}