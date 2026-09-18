import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

test('sync repairs symptom aliases and retains pending data on failure', async () => {
  globalThis.window = {};
  const storage = new Map();
  globalThis.localStorage = { getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v) };
  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
  const result = await (async () => {
      const { openDB, put, get, all, atomic, reconcileSymptoms } = await import('../js/db.js');
      const { Cloud } = await import('../js/cloud.js');
      const db = await openDB('sync-regression');
      const remote = [{ id: 'canonical', nombre: 'Rojez', revision: 3, activo: true }];
      for (const id of ['imported', 'duplicate']) await put(db, 'sintomas', { id, nombre: 'Rojez' });
      await put(db, 'ajustes', { clave: 'importado:sintomas:guest', valor: 'imported' }, false);
      await put(db, 'registros', {
        id: 'day', fecha: '2026-09-18', notas: 'keep diary',
        sintomas: ['imported', 'duplicate'], intensidades: { imported: 2, duplicate: 3 },
        zonas: [{ zona_id: 1, sintoma_id: 'imported', intensidad: 2, notas: 'first' },
                { zona_id: 1, sintoma_id: 'duplicate', intensidad: 3, notas: 'second' }],
        fotos: [{ id: 'photo', blob: new Blob(['photo']), storage_path: 'existing.jpg' }],
      });
      window.SCAR_CONFIG = { supabaseUrl: 'https://test.supabase.co', supabasePublishableKey: 'test' };
      const cloud = new Cloud();
      cloud.saveSession({ access_token: 'test', expires_in: 3600, user: { id: 'owner' } });
      const writes = [];
      cloud.rows = async table => table === 'sintomas' ? remote : [];
      cloud.cleanup = async () => {};
      cloud.request = async (url, options) => {
        const { p_tabla, p_datos } = options.body;
        writes.push({ table: p_tabla, data: p_datos });
        return { id: p_datos.id, revision: 1 };
      };
      const statuses = [];
      await cloud.sync(db, s => statuses.push(s));
      const firstWrites = writes.length;
      await cloud.sync(db);
      const record = await get(db, 'registros', '2026-09-18');
      const marker = await get(db, 'ajustes', 'importado:sintomas:guest');
      // Callback exceptions must reject and abort instead of hanging or rejecting null.
      let callbackError;
      try { await atomic(db, 'registros', record.fecha, () => { throw Error('callback failed'); }); }
      catch (e) { callbackError = e?.message; }
      let writeError;
      try { await put(db, 'sintomas', { nombre: 'missing id' }); }
      catch (e) { writeError = !!e; }
      // Previously synced rows and unsaved canonical edits must remain untouched.
      await put(db, 'sintomas', { ...remote[0], __version: 3, activo: false });
      await put(db, 'sintomas', { id: 'synced-other', nombre: 'Rojez', __version: 1 });
      await put(db, 'sintomas', { id: 'third-alias', nombre: 'Rojez' });
      await reconcileSymptoms(db, remote);
      const protectedRows = await all(db, 'sintomas');
      // A failed cloud write must leave the record dirty with a readable error.
      await put(db, 'registros', record);
      cloud.request = async () => { throw null; };
      await cloud.sync(db);
      const failed = await get(db, 'registros', record.fecha);
      return { writes: writes.slice(0, firstWrites), firstWrites, totalWrites: writes.length,
        record, marker, statuses, callbackError, writeError, protectedRows,
        blob: await record.fotos[0].blob.text(), failedDirty: !!failed.__dirty, failedError: failed.__error };
    })();
    assert.equal(result.firstWrites, 1);
    assert.equal(result.totalWrites, 1, 'second sync must be idempotent');
    assert.equal(result.writes[0].table, 'registros');
    assert.deepEqual(result.writes[0].data.sintomas, [{ id: 'canonical', intensidad: 3 }]);
    assert.equal(result.record.zonas.length, 1);
    assert.equal(result.record.zonas[0].sintoma_id, 'canonical');
    assert.equal(result.record.zonas[0].notas, 'first\nsecond');
    assert.equal(result.record.notas, 'keep diary');
    assert.equal(result.blob, 'photo');
    assert.equal(result.record.__dirty, undefined);
    assert.equal(result.marker.valor, 'canonical');
    assert.equal(result.statuses.at(-1), 'Todo guardado en la nube');
    assert.equal(result.callbackError, 'callback failed');
    assert.equal(result.writeError, true);
    assert.equal(result.protectedRows.length, 2);
    assert.equal(result.protectedRows.find(r => r.id === 'canonical').activo, false);
    assert.ok(result.protectedRows.find(r => r.id === 'synced-other'));
    assert.equal(result.failedDirty, true);
    assert.match(result.failedError, /No se pudo guardar/);
    console.log('PASS: duplicate recovery, remapped records/zones/import markers, preserved photos and edits, idempotence, failed sync retention, and IndexedDB errors');
});
