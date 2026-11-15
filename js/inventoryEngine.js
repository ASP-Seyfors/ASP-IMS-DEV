/* =======================================================================
 * Allied Surgical Products - Inventory Management System
 * File: js/inventoryEngine.js
 * Description: Client-Side gatekeeper. Handles read-only validations, 
 * UOM multipliers, and prevents over-packing before cloud transmission.
 * ======================================================================= */
const InventoryEngine = {

  lookupAndNormalize(ref, gtin, currentDb) {
    let cleanRef = (ref || '').trim().toUpperCase();
    let cleanGtin = (gtin || '').replace(/^(01|\(01\))/, '').trim();
    
    if (cleanRef) {
        let match = currentDb.find(i => (i.sku || i.ref || '').toUpperCase() === cleanRef);
        if (match) return match;
    }

    if (cleanGtin && cleanGtin.toUpperCase() !== "N/A" && cleanGtin.toUpperCase() !== "NA") {
        let match = currentDb.find(i => i.gtin && i.gtin === cleanGtin);
        if (match) return match;
    }

    return null;
  },

  calculateUOM(matchedItem, scannedQty, fallbackRef) {
    let finalQty = parseInt(scannedQty, 10) || 1;
    let finalRef = matchedItem ? (matchedItem.sku || matchedItem.ref) : fallbackRef.toUpperCase();

    if (matchedItem && matchedItem.parentRef && matchedItem.uomMult > 1) {
      finalQty = finalQty * matchedItem.uomMult;
      // ✨ THE FIX: Strip the '*' prefix if the item is marked as Sell As Box Only
      finalRef = String(matchedItem.parentRef).replace(/^\*/, '').trim().toUpperCase();
    }

    return { trueRef: finalRef, trueQty: finalQty };
  },

  // ✨ PHASE 3: Universal Packaging Display Helper
  getPackagingDisplay(item, currentDb, availableEaches) {
    let isBundle = item.parentRef && parseInt(item.uomMult, 10) > 1;
    let uom = parseInt(item.uomMult, 10) || 1;
    
    let children = currentDb.filter(c => 
        (c.parentRef || '').replace(/^\*/, '').toUpperCase() === (item.sku || item.ref || '').toUpperCase() 
        && parseInt(c.uomMult, 10) > 1
    );
    
    let isBoxOnly = children.some(c => String(c.parentRef).startsWith('*'));
    let largestBundle = children.reduce((max, c) => Math.max(max, parseInt(c.uomMult, 10)), 1);

    // If item has a Display Alias, we return it here to be used universally!
    let printRef = item.displayAlias ? item.displayAlias : (item.sku || item.ref);

    if (isBundle) {
        let boxes = Math.floor(availableEaches / uom);
        return { 
            printRef: printRef, totalUnits: availableEaches, displayQty: String(boxes), 
            displayString: `${boxes} Box(es) of ${uom}`, isBoxOnly: false, shouldHide: (boxes === 0) 
        };
    } else {
        if (isBoxOnly) return { printRef: printRef, totalUnits: availableEaches, displayQty: "0", displayString: "Hidden (Box Only)", isBoxOnly: true, shouldHide: true };
        if (largestBundle > 1) {
            let eaches = availableEaches % largestBundle;
            return { printRef: printRef, totalUnits: availableEaches, displayQty: String(eaches), displayString: `${eaches} Eaches`, isBoxOnly: false, shouldHide: (eaches === 0) };
        }
        return { printRef: printRef, totalUnits: availableEaches, displayQty: String(availableEaches), displayString: `${availableEaches} Eaches`, isBoxOnly: false, shouldHide: (availableEaches === 0) };
    }
  },

  validateAvailability(trueRef, requestedQty, action, currentDb, customerTag, currentAllocations, ignoreOverpack = false, workflowType = '') {
    if (workflowType.toUpperCase().includes('RECEIVING') || workflowType.toUpperCase().includes('STOCKTAKE')) {
        return true;
    }

    let dbItem = currentDb.find(i => (i.sku || i.ref || '').toUpperCase() === trueRef);
    if (!dbItem) throw new Error(`Item ${trueRef} was not found in the database. Cannot reserve or pack.`);

    let onHand = parseInt(dbItem.onHand, 10) || 0;
    let reserved = parseInt(dbItem.reservedQty, 10) || 0;
    let available = onHand - reserved;

    if (action === 'Reserved') {
      if (requestedQty > available) {
        throw new Error(`You are trying to reserve ${requestedQty}, with ${available} available.`);
      }
    }

    if (action === 'Pack & Ship') {
      let baseTag = (customerTag || '').toUpperCase().split('(')[0].split('-')[0].trim();
      let allocData = (currentAllocations[baseTag] && currentAllocations[baseTag][trueRef]) ? currentAllocations[baseTag][trueRef] : 0;
      let allocatedToCust = typeof allocData === 'object' ? (allocData.qty || 0) : allocData;
      
      if (requestedQty > allocatedToCust) {
        let extraNeeded = requestedQty - allocatedToCust;
        if (extraNeeded > available) {
            throw new Error(`There are currently ${available} units available.`);
        } 
        else if (!ignoreOverpack) {
            throw new Error(`OVERPACK_WARNING: You are packing ${requestedQty}, but this customer only has ${allocatedToCust} reserved. This will pull ${extraNeeded} unit(s) from available inventory. Proceed?`);
        }
      }
    }

    if (action === 'Un-Reserve') {
      let baseTag = (customerTag || '').toUpperCase().split('(')[0].split('-')[0].trim();
      let allocData = (currentAllocations[baseTag] && currentAllocations[baseTag][trueRef]) ? currentAllocations[baseTag][trueRef] : 0;
      let allocatedToCust = typeof allocData === 'object' ? (allocData.qty || 0) : allocData;
      
      if (requestedQty > allocatedToCust) {
         throw new Error(`Cannot Un-Reserve ${requestedQty} units. Customer ${baseTag} only has ${allocatedToCust} units of ${trueRef} currently reserved.`);
      }
    }

    return true;
  }
};