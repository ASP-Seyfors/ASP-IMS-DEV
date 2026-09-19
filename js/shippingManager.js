/* =======================================================================
 * Allied Surgical Products - Inventory Management System
 * File: js/shippingManager.js
 * Description: Calculates Suture Box math (Weight/Dimensions) and 
 *              manages the final FedEx/UPS shipping intercept.
 * ======================================================================= */
const ShippingManager = {
    openModal() {
        this.populateCustomerLogistics();
        this.recalculateBoxMath();
        document.getElementById('shipmentManagerModal').style.display = 'flex';
    },

    populateCustomerLogistics() {
        // Parse exact customer name from session
        let baseName = SessionManager.currentSessionName.split('(')[0].trim().toUpperCase();
        document.getElementById('shipCustName').value = baseName;
        
        let rules = DatabaseManager.shippingRules[baseName] || {};
        let carrierSel = document.getElementById('shipCarrier');
        
        if (rules.method) {
            let opt = Array.from(carrierSel.options).find(o => o.value.toUpperCase() === rules.method.toUpperCase());
            if (opt) carrierSel.value = opt.value;
        }
        
        document.getElementById('shipAccountNum').value = rules.account || '';
        document.getElementById('shipNotes').value = rules.notes || '';
    },

    recalculateBoxMath() {
        let totalVol = 0;
        let totalWeight = 0;
        let maxLen = 0;
        let hasNonSuture = false;

        SessionManager.scannedObjects.forEach(item => {
            let qty = item.qty;
            let ref = item.ref.toUpperCase();
            let dbItem = DatabaseManager.db.find(i => (i.sku || i.ref || '').toUpperCase() === ref) || {};
            let isSuture = (dbItem.category || '').toUpperCase().includes('SUTURE');
            
            let w = 0, l = 0, wd = 0, h = 0, vol = 0;

            if (isSuture) {
                let lastChar = ref.slice(-1);
                if (lastChar === 'G') { w = 0.35; l = 5.5; wd = 2.5; h = 2.5; vol = 34.375; }
                else if (lastChar === 'T') { w = 0.65; l = 5.5; wd = 4.5; h = 2.5; vol = 61.875; }
                else if (lastChar === 'H') { w = 1.15; l = 22.0; wd = 7.5; h = 2.0; vol = 330.0; }
                else { w = 0.5; l = 6.0; wd = 4.0; h = 4.0; vol = 96.0; } // Default generic suture
            } else {
                hasNonSuture = true;
                w = parseFloat(dbItem.weight) || 0.5;
                l = parseFloat(dbItem.dimL) || 6.0;
                wd = parseFloat(dbItem.dimW) || 4.0;
                h = parseFloat(dbItem.dimH) || 4.0;
                vol = l * wd * h;
            }

            totalWeight += (w * qty);
            totalVol += (vol * qty);
            if (l > maxLen) maxLen = l;
        });

        let paddedVol = totalVol * 1.15; // Add 15% buffer for bubble wrap/void fill
        let selectedBox = "CUSTOM";
        let boxDims = { l: 0, w: 0, h: 0 };

        // Standard Box Definitions (Sorted by Volume)
        const boxes = [
            { id: 'S', l: 12, w: 6, h: 6, vol: 432 }, 
            { id: 'XS', l: 8, w: 8, h: 8, vol: 512 },
            { id: 'M', l: 22, w: 13, h: 15, vol: 4290 },
            { id: 'L', l: 27, w: 15, h: 17, vol: 6885 }
        ];

        // Find the smallest box that satisfies BOTH the total volume AND the longest item
        for (let box of boxes) {
            if (box.vol >= paddedVol && Math.max(box.l, box.w, box.h) >= maxLen) {
                selectedBox = box.id;
                boxDims = box;
                break;
            }
        }

        document.getElementById('shipBoxSize').value = selectedBox;
        if (selectedBox !== "CUSTOM") {
            document.getElementById('shipDimL').value = boxDims.l;
            document.getElementById('shipDimW').value = boxDims.w;
            document.getElementById('shipDimH').value = boxDims.h;
        }
        
        document.getElementById('shipWeight').value = totalWeight.toFixed(1);
        document.getElementById('shipWeightWarning').style.display = hasNonSuture ? 'flex' : 'none';
    },

    handleBoxSizeChange() {
        let val = document.getElementById('shipBoxSize').value;
        if (val === 'XS') { document.getElementById('shipDimL').value = 8; document.getElementById('shipDimW').value = 8; document.getElementById('shipDimH').value = 8; }
        else if (val === 'S') { document.getElementById('shipDimL').value = 12; document.getElementById('shipDimW').value = 6; document.getElementById('shipDimH').value = 6; }
        else if (val === 'M') { document.getElementById('shipDimL').value = 22; document.getElementById('shipDimW').value = 13; document.getElementById('shipDimH').value = 15; }
        else if (val === 'L') { document.getElementById('shipDimL').value = 27; document.getElementById('shipDimW').value = 15; document.getElementById('shipDimH').value = 17; }
    },

    async generateFedExLabel() {
        // Grab the button to show a loading state
        let btn = document.getElementById('btnGenerateFedExLabel'); // Ensure your HTML button has this ID!
        let origText = btn ? btn.innerText : "Generate FedEx Label";
        if (btn) { btn.innerText = "⏳ Requesting Label..."; btn.disabled = true; }

        // Pull the pre-calculated math directly from your UI fields
        let customerName = document.getElementById('shipCustName').value.trim() || "Valued Customer";
        let totalWeight = parseFloat(document.getElementById('shipWeight').value) || 1.0;
        let dimL = document.getElementById('shipDimL').value || 12;
        let dimW = document.getElementById('shipDimW').value || 6;
        let dimH = document.getElementById('shipDimH').value || 6;
        let orderNum = SessionManager.currentOrderNum || ""; 

        let payload = {
            action: "CREATE_SHIPMENT",
            payload: {
                customerName: customerName,
                orderNum: orderNum,
                totalWeight: totalWeight,
                dimL: dimL,
                dimW: dimW,
                dimH: dimH,
                street: "123 Sandbox Ave", // Hardcoded dummy variables for Sandbox testing
                city: "Tampa",
                state: "FL",
                zip: "33602"
            }
        };

        try {
            // Note: We omit mode: 'no-cors' here so the browser is allowed to read the JSON response from Google
            let res = await fetch(SessionManager.getActiveArchiveUrl(), {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload)
            });
            
            let data = await res.json();
            
            if (data.status === "success") {
                alert(`✅ FedEx Label Generated!\nTracking: ${data.trackingNumber}`);
                
                // Convert the Base64 response into a printable PDF and open it in a new tab
                let pdfData = "data:application/pdf;base64," + data.label;
                let printWin = window.open('', '_blank');
                if (printWin) {
                    printWin.document.write(`<iframe width='100%' height='100%' src='${pdfData}' style='border:none; margin:0; padding:0;'></iframe>`);
                    printWin.document.title = `FedEx_Label_${data.trackingNumber}`;
                } else {
                    alert("Pop-up blocked! Please allow pop-ups to view your shipping label.");
                }

                // Automatically move to the next screen
                this.skipAndComplete();

            } else {
                alert("FedEx API Error: " + data.message);
            }
        } catch (err) {
            alert("Network Error generating FedEx Label: " + err.message);
        } finally {
            if (btn) { btn.innerText = origText; btn.disabled = false; }
        }
    },

    skipAndComplete() {
        document.getElementById('shipmentManagerModal').style.display = 'none';
        // Pass skipShipping = true to bypass the intercept
        SessionManager.completeSession(true, true);
    }
};