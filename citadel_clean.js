(async () => {
    const DB_NAME = 'mystats-db';
    const DB_VERSION = 4;
    
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onsuccess = (event) => {
        const db = event.target.result;
        const tx = db.transaction(['journal', 'insights'], 'readwrite');
        const journalStore = tx.objectStore('journal');
        const insightStore = tx.objectStore('insights');
        
        // Strategy: Delete 'h-' and 'i-' prefixed records that were part of the Alpha restoration
        // as they are now superseded by 'hb-' and 'ib-'.
        
        let deletedJournal = 0;
        let deletedInsights = 0;

        const journalReq = journalStore.getAll();
        journalReq.onsuccess = () => {
            journalReq.result.forEach(item => {
                if (item.id.startsWith('h-') && !item.id.startsWith('hb-')) {
                    journalStore.delete(item.id);
                    deletedJournal++;
                }
            });
            console.log('Cleaned ' + deletedJournal + ' redundant journal nodes.');
        };

        const insightReq = insightStore.getAll();
        insightReq.onsuccess = () => {
            insightReq.result.forEach(item => {
                if (item.id.startsWith('i-') && !item.id.startsWith('ib-')) {
                    insightStore.delete(item.id);
                    deletedInsights++;
                }
            });
            console.log('Cleaned ' + deletedInsights + ' redundant insight nodes.');
        };
        
        tx.oncomplete = () => {
            console.log('Citadel Cleaning Complete.');
        };
    };
})();
