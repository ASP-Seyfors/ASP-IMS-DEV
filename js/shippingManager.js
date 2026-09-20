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

    async populateCustomerLogistics() {
        let baseName = SessionManager.currentSessionName.split('(')[0].trim().toUpperCase();
        let rules = DatabaseManager.shippingRules[baseName] || {};
        
        let safeSet = (id, val) => { let el = document.getElementById(id); if (el) el.value = val || ''; };
        
        // Populate core rules
        safeSet('shipCustName', baseName);
        safeSet('shipAddressCompany', baseName);
        safeSet('shipAccountNum', rules.account);
        safeSet('shipInstructions', rules.notes);
        safeSet('shipAddressContact', rules.contactName);
        
        let carrierSel = document.getElementById('shipCarrier');
        if (rules.method && carrierSel) {
            let opt = Array.from(carrierSel.options).find(o => o.value.toUpperCase() === rules.method.toUpperCase());
            if (opt) carrierSel.value = opt.value;
        }

        // ✨ SMART ADDRESS PARSER
        // Parses a single string from the DB (e.g. "4914 Flora Ave, Holiday, FL 34690")
        if (rules.address) {
            let addr = rules.address.trim();
            
            // Extract Zip (5 digits)
            let zipMatch = addr.match(/\b\d{5}\b/);
            if (zipMatch) safeSet('shipAddressZip', zipMatch[0]);
            
            // Extract State (2 uppercase letters)
            let stateMatch = addr.match(/\b([A-Z]{2})\b/g);
            if (stateMatch && stateMatch.length > 0) {
                safeSet('shipAddressState', stateMatch[stateMatch.length - 1]);
            }

            // Split by comma to isolate Street and City
            let parts = addr.split(',');
            if (parts.length >= 2) {
                // The first chunk is the Street
                safeSet('shipAddress1', parts[0].trim());
                
                // The second chunk contains the City (strip out state/zip if they are in the same chunk)
                let cityStr = parts[1].replace(/\b\d{5}\b/g, '').replace(/\b([A-Z]{2})\b/g, '').trim();
                safeSet('shipAddressCity', cityStr);
            } else {
                // Fallback if no commas were used in the Google Sheet
                safeSet('shipAddress1', addr);
            }
        } else {
            // Clear fields if no address is found in the database
            safeSet('shipAddress1', '');
            safeSet('shipAddress2', '');
            safeSet('shipAddressCity', '');
            safeSet('shipAddressState', '');
            safeSet('shipAddressZip', '');
        }
    },

    recalculateBoxMath() {
        let totalVol = 0, totalWeight = 0, maxLen = 0, hasNonSuture = false;

        SessionManager.scannedObjects.forEach(item => {
            let qty = item.qty, ref = item.ref.toUpperCase();
            let dbItem = DatabaseManager.db.find(i => (i.sku || i.ref || '').toUpperCase() === ref) || {};
            let isSuture = (dbItem.category || '').toUpperCase().includes('SUTURE');
            let w = 0, l = 0, wd = 0, h = 0, vol = 0;

            if (isSuture) {
                let lastChar = ref.slice(-1);
                if (lastChar === 'G') { w = 0.35; l = 5.5; wd = 2.5; h = 2.5; vol = 34.375; }
                else if (lastChar === 'T') { w = 0.65; l = 5.5; wd = 4.5; h = 2.5; vol = 61.875; }
                else if (lastChar === 'H') { w = 1.15; l = 22.0; wd = 7.5; h = 2.0; vol = 330.0; }
                else { w = 0.5; l = 6.0; wd = 4.0; h = 4.0; vol = 96.0; } 
            } else {
                hasNonSuture = true;
                w = parseFloat(dbItem.weight) || 0.5; l = parseFloat(dbItem.dimL) || 6.0;
                wd = parseFloat(dbItem.dimW) || 4.0; h = parseFloat(dbItem.dimH) || 4.0;
                vol = l * wd * h;
            }
            totalWeight += (w * qty); totalVol += (vol * qty);
            if (l > maxLen) maxLen = l;
        });

        let paddedVol = totalVol * 1.15;
        let selectedBox = "CUSTOM", boxDims = { l: 0, w: 0, h: 0 };
        const boxes = [
            { id: 'S', l: 12, w: 6, h: 6, vol: 432 }, 
            { id: 'XS', l: 8, w: 8, h: 8, vol: 512 },
            { id: 'M', l: 22, w: 13, h: 15, vol: 4290 },
            { id: 'L', l: 27, w: 15, h: 17, vol: 6885 }
        ];

        for (let box of boxes) {
            if (box.vol >= paddedVol && Math.max(box.l, box.w, box.h) >= maxLen) {
                selectedBox = box.id; boxDims = box; break;
            }
        }

        document.getElementById('shipBoxSize').value = selectedBox;
        if (selectedBox !== "CUSTOM") {
            document.getElementById('shipDimL').value = boxDims.l;
            document.getElementById('shipDimW').value = boxDims.w;
            document.getElementById('shipDimH').value = boxDims.h;
        }
        
        document.getElementById('shipWeight').value = totalWeight.toFixed(1);
        document.getElementById('shipWeightWarning').style.display = hasNonSuture ? 'inline-block' : 'none';
    },

    handleBoxSizeChange() {
        let val = document.getElementById('shipBoxSize').value;
        if (val === 'XS') { document.getElementById('shipDimL').value = 8; document.getElementById('shipDimW').value = 8; document.getElementById('shipDimH').value = 8; }
        else if (val === 'S') { document.getElementById('shipDimL').value = 12; document.getElementById('shipDimW').value = 6; document.getElementById('shipDimH').value = 6; }
        else if (val === 'M') { document.getElementById('shipDimL').value = 22; document.getElementById('shipDimW').value = 13; document.getElementById('shipDimH').value = 15; }
        else if (val === 'L') { document.getElementById('shipDimL').value = 27; document.getElementById('shipDimW').value = 15; document.getElementById('shipDimH').value = 17; }
    },
    
    skipAndComplete() {
        let modal = document.getElementById('shipmentManagerModal');
        if (modal) modal.style.display = 'none';

        let btn1 = document.getElementById('btnLogTrackingOnly');
        if (btn1) { btn1.innerText = "Log Tracking Only"; btn1.disabled = false; }
        let btn2 = document.getElementById('btnGenerateLabel');
        if (btn2) { btn2.innerHTML = `<i data-lucide="printer"></i> Purchase FedEx Label`; btn2.disabled = false; }

        // ✨ FIXED: Pass (true, true) to bypass the shipping intercept
        if (typeof SessionManager !== 'undefined') SessionManager.completeSession(true, true);
    },

    async logManualTracking() {
        let trackingNum = prompt("Please paste the pre-provided tracking number:");
        if (!trackingNum || trackingNum.trim() === "") return;

        let btn = document.getElementById('btnLogTrackingOnly');
        let origText = btn.innerText;
        if (btn) { btn.innerText = "⏳ Logging..."; btn.disabled = true; }

        let payload = {
            action: "LOG_MANUAL_TRACKING",
            payload: {
                customerName: document.getElementById('shipAddressCompany').value.trim() || document.getElementById('shipCustName').value.trim(),
                orderNum: SessionManager.currentOrderNum || "",
                carrier: document.getElementById('shipCarrier').value,
                trackingNumber: trackingNum.trim()
            }
        };

        try {
            let res = await fetch(SessionManager.getActiveArchiveUrl(), {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload)
            });
            let data = await res.json();
            if (data.status === "success") {
                this.skipAndComplete(); 
            } else {
                alert("Database Error: " + data.message);
            }
        } catch (err) {
            alert("Network Error: " + err.message);
        } finally {
            if (btn) { btn.innerText = origText; btn.disabled = false; }
        }
    },

    async generateFedExLabel() {
        let btn = document.getElementById('btnGenerateLabel');
        let origText = btn.innerHTML;
        if (btn) { btn.innerHTML = "⏳ Requesting Label..."; btn.disabled = true; }

        try {
            let serviceType = document.getElementById('shipServiceType').value;
            let isResidential = document.querySelector('input[name="shipAddressType"]:checked').value === 'residential';
            if (serviceType === 'FEDEX_GROUND' && isResidential) serviceType = 'GROUND_HOME_DELIVERY';

            let payload = {
                action: "CREATE_SHIPMENT",
                payload: {
                    customerName: document.getElementById('shipAddressCompany').value.trim(),
                    contactName: document.getElementById('shipAddressContact').value.trim(),
                    orderNum: SessionManager.currentOrderNum || "N/A",
                    totalWeight: document.getElementById('shipWeight').value,
                    street: document.getElementById('shipAddress1').value.trim() + " " + document.getElementById('shipAddress2').value.trim(),
                    city: document.getElementById('shipAddressCity').value.trim(),
                    state: document.getElementById('shipAddressState').value.trim(),
                    zip: document.getElementById('shipAddressZip').value.trim(),
                    serviceType: serviceType,
                    isResidential: isResidential // ✨ Sending Residential flag to Apps Script
                }
            };

            let res = await fetch(SessionManager.getActiveArchiveUrl(), {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload)
            });
            
            let data = await res.json();
            if (data.status === "success") {
                // Convert Base64 to a standard Blob so Chrome allows the PDF to open
                let byteCharacters = atob(data.label);
                let byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                let byteArray = new Uint8Array(byteNumbers);
                let fileBlob = new Blob([byteArray], { type: 'application/pdf' });
                let blobUrl = URL.createObjectURL(fileBlob);
                
                let printWindow = window.open(blobUrl, "_blank");
                if (!printWindow) alert("Pop-up blocked! Please allow pop-ups to view your shipping label.");
                
                this.skipAndComplete();
            } else {
                alert("FedEx API Error: " + data.message);
            }
        } catch (err) {
            alert("Network Error generating FedEx Label: " + err.message);
        } finally {
            if (btn) { btn.innerHTML = origText; btn.disabled = false; }
        }
    }
};