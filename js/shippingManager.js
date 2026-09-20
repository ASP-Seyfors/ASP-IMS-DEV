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
        document.getElementById('shipCustName').value = baseName;
        document.getElementById('shipAddressCompany').value = baseName;
        
        let rules = DatabaseManager.shippingRules[baseName] || {};
        let carrierSel = document.getElementById('shipCarrier');
        
        if (rules.method) {
            let opt = Array.from(carrierSel.options).find(o => o.value.toUpperCase() === rules.method.toUpperCase());
            if (opt) carrierSel.value = opt.value;
        }
        
        document.getElementById('shipAccountNum').value = rules.account || '';
        document.getElementById('shipNotes').value = rules.notes || '';

        // ✨ AUTO-FILL NEW COLUMNS FROM DATABASE CACHE
        document.getElementById('shipAddressName').value = rules.contactName || '';
        document.getElementById('shipPhone').value = rules.phone || ''; // Ensure phone input exists or map accordingly
        
        // Split the single address string from Col E into street, city, state, zip for the form inputs
        if (rules.address) {
            document.getElementById('shipAddressStreet1').value = rules.address;
            
            // Basic regex helpers to parse city/state/zip if formatted cleanly
            let zipMatch = rules.address.match(/\b\d{5}\b/);
            let stateMatch = rules.address.match(/\b([A-Z]{2})\b/g);
            
            if (zipMatch) document.getElementById('shipAddressZip').value = zipMatch[0];
            if (stateMatch && stateMatch.length > 0) {
                // Grab the last 2-letter uppercase match as the state
                document.getElementById('shipAddressState').value = stateMatch[stateMatch.length - 1];
            }
        }
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
    
    skipAndComplete() {
        let modal = document.getElementById('shipmentManagerModal');
        if (modal) modal.style.display = 'none';

        // Reset the button states in case they try another session later
        let btn1 = document.getElementById('btnLogTrackingOnly');
        if (btn1) { btn1.innerText = "Log Tracking Only"; btn1.disabled = false; }
        
        let btn2 = document.getElementById('btnGenerateLabel');
        if (btn2) { btn2.innerHTML = `<i data-lucide="printer"></i> Purchase FedEx Label`; btn2.disabled = false; }

        // Safely complete the workflow
        if (typeof SessionManager !== 'undefined' && typeof SessionManager.completeSession === 'function') {
            SessionManager.completeSession();
        }
    },

    async logManualTracking() {
        let trackingNum = prompt("Please paste the pre-provided tracking number:");
        if (!trackingNum || trackingNum.trim() === "") return;

        let btn = document.getElementById('btnLogTrackingOnly');
        let origText = btn.innerText;
        if (btn) { btn.innerText = "⏳ Logging..."; btn.disabled = true; }

        let customerName = document.getElementById('shipAddressCompany').value.trim() || document.getElementById('shipCustName').value.trim();
        let carrier = document.getElementById('shipCarrier').value;
        let orderNum = SessionManager.currentOrderNum || "";

        let payload = {
            action: "LOG_MANUAL_TRACKING",
            payload: {
                customerName: customerName,
                orderNum: orderNum,
                carrier: carrier,
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
                // ✨ FIX: Explicitly call ShippingManager to prevent 'this' context errors
                ShippingManager.skipAndComplete(); 
            } else {
                alert("Database Error: " + data.message);
            }
        } catch (err) {
            alert("Network Error logging tracking: " + err.message);
        } finally {
            if (btn) { btn.innerText = origText; btn.disabled = false; }
        }
    },

    async generateFedExLabel() {
        let btn = document.getElementById('btnGenerateLabel');
        let origText = btn.innerHTML;
        if (btn) { btn.innerHTML = "⏳ Requesting Label..."; btn.disabled = true; }

        try {
            let customerName = document.getElementById('shipAddressCompany').value.trim();
            let contactName = document.getElementById('shipAddressContact').value.trim();
            let street = document.getElementById('shipAddress1').value.trim() + " " + document.getElementById('shipAddress2').value.trim();
            let city = document.getElementById('shipAddressCity').value.trim();
            let state = document.getElementById('shipAddressState').value.trim();
            let zip = document.getElementById('shipAddressZip').value.trim();
            
            let totalWeight = document.getElementById('shipEstWeight').value;
            let orderNum = SessionManager.currentOrderNum || "N/A";
            
            // ✨ FIX: FedEx Strict Routing (Ground to Residential MUST be Ground Home Delivery)
            let serviceType = document.getElementById('shipServiceType').value;
            let isResidential = document.querySelector('input[name="shipAddressType"]:checked').value === 'residential';
            if (serviceType === 'FEDEX_GROUND' && isResidential) {
                serviceType = 'GROUND_HOME_DELIVERY';
            }

            let payload = {
                action: "CREATE_SHIPMENT",
                payload: {
                    customerName: customerName,
                    contactName: contactName,
                    orderNum: orderNum,
                    totalWeight: totalWeight,
                    street: street,
                    city: city,
                    state: state,
                    zip: zip,
                    serviceType: serviceType
                }
            };

            let res = await fetch(SessionManager.getActiveArchiveUrl(), {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload)
            });
            
            let data = await res.json();
            
            if (data.status === "success") {
                let pdfDataUri = "data:application/pdf;base64," + data.label;
                let printWindow = window.open(pdfDataUri, "_blank");
                if (!printWindow) {
                    alert("Pop-up blocked! Please allow pop-ups to view your shipping label.");
                }
                
                // ✨ FIX: Explicitly call ShippingManager to prevent context errors
                ShippingManager.skipAndComplete();
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