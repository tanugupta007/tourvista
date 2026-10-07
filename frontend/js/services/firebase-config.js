export const db = { name: 'tourvista-local-db' };

export function collection(dbRef, collectionName) {
  return { dbRef, collectionName };
}

export function doc(dbRef, collectionName, id) {
  return { dbRef, collectionName, id };
}

function getCollectionKey(collectionName) {
  return `tourvista_${collectionName}`;
}

function readCollection(collectionName) {
  try {
    const raw = localStorage.getItem(getCollectionKey(collectionName));
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    return [];
  }
}

function writeCollection(collectionName, items) {
  localStorage.setItem(getCollectionKey(collectionName), JSON.stringify(items));
}

export async function getDocs(collectionRef) {
  const items = readCollection(collectionRef.collectionName);
  return {
    empty: items.length === 0,
    docs: items.map((item, index) => ({
      id: item.id || String(index),
      data: () => item
    }))
  };
}

export async function addDoc(collectionRef, data) {
  const items = readCollection(collectionRef.collectionName);
  const id = data.id || `local_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const record = { ...data, id };
  items.push(record);
  writeCollection(collectionRef.collectionName, items);
  return { id };
}

export async function deleteDoc(docRef) {
  const items = readCollection(docRef.collectionName);
  const updated = items.filter(item => item.id !== docRef.id);
  writeCollection(docRef.collectionName, updated);
  return true;
}
