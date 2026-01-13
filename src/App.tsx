/*
// ============================================================================
// 🧱 INÍCIO DO CÓDIGO BACKEND (GOOGLE APPS SCRIPT)
// ============================================================================
// COPIE TUDO DESTE BLOCO E COLE NO SEU EDITOR DE SCRIPTS NA PLANILHA.
// DEPOIS: CLIQUE EM IMPLANTAR > NOVA IMPLANTAÇÃO > WEB APP > QUALQUER PESSOA.

function doGet(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    const db = {
      status: "online",
      config: lerConfig(),
      maquinas: lerAba("MAQUINAS"),
      materiais: lerAba("ESTOQUE"),
      insumos: lerAba("INSUMOS_ACABAMENTO"), // Verifique se sua aba chama isso ou INSUMO_ACABAMENTO
      marketplaces: lerAba("MARKETPLACES"),
      historico_vendas: lerAba("VENDAS", 10), 
      historico_gastos: lerAba("GASTOS", 10)
    };

    return ContentService
      .createTextOutput(JSON.stringify(db))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (erro) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: "error", message: erro.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    const dados = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // --- 1. REGISTRAR VENDA & BAIXAR ESTOQUE ---
    if (dados.action === "nova_venda") {
      const abaVendas = ss.getSheetByName("VENDAS");
      if (!abaVendas) throw new Error("Aba VENDAS não encontrada");
      
      abaVendas.appendRow([
        new Date(), 
        dados.produto, 
        dados.material, 
        dados.peso, 
        dados.custo, 
        dados.venda, 
        dados.lucro, 
        dados.canal
      ]);
      
      if (dados.materialId && dados.peso) {
        atualizarEstoque(dados.materialId, dados.peso * -1);
      }
    } 
    
    // --- 2. GESTÃO DE ESTOQUE (CRUD) ---
    else if (dados.action === "novo_material") {
      const aba = ss.getSheetByName("ESTOQUE");
      if (!aba) throw new Error("Aba ESTOQUE não encontrada");
      
      const novoId = "F" + (Number(aba.getLastRow()) + 1); 
      // Ordem: ID, Marca, Tipo, Cor, Hex, Peso_Ini, Peso_Atual, Preco
      aba.appendRow([
        novoId, 
        dados.marca, 
        dados.tipo, 
        dados.cor, 
        dados.hex, 
        dados.peso_inicial, 
        dados.peso_inicial, 
        dados.preco
      ]);
    }
    
    else if (dados.action === "editar_material") {
      editarLinha("ESTOQUE", dados.id, [
        dados.marca, 
        dados.tipo, 
        dados.cor, 
        dados.hex, 
        dados.peso_inicial, 
        dados.peso_atual, 
        dados.preco
      ]);
    }
    
    else if (dados.action === "deletar_material") {
      deletarLinha("ESTOQUE", dados.id);
    }

    // --- 3. GASTOS ---
    else if (dados.action === "novo_gasto") {
      const aba = ss.getSheetByName("GASTOS");
      if (!aba) throw new Error("Aba GASTOS não encontrada");
      aba.appendRow([new Date(), dados.item, dados.categoria, dados.valor, dados.obs || ""]);
    }

    return ContentService.createTextOutput(JSON.stringify({ result: "success" }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (erro) {
    return ContentService
      .createTextOutput(JSON.stringify({ result: "error", message: erro.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

// --- FUNÇÕES AUXILIARES ---

function atualizarEstoque(id, deltaPeso) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("ESTOQUE");
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) == String(id)) {
      // Índice 6 = Coluna G (Peso Atual)
      const currentVal = Number(data[i][6]); 
      const newVal = currentVal + Number(deltaPeso);
      sheet.getRange(i + 1, 7).setValue(newVal);
      break;
    }
  }
}

function editarLinha(nomeAba, id, novosDados) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nomeAba);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) == String(id)) {
      // Atualiza da coluna 2 até o fim
      sheet.getRange(i + 1, 2, 1, novosDados.length).setValues([novosDados]);
      break;
    }
  }
}

function deletarLinha(nomeAba, id) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nomeAba);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) == String(id)) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
}

function lerConfig() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("CONFIG");
  if (!sheet) return {}; 
  const data = sheet.getDataRange().getValues();
  const config = {};
  for (let i = 1; i < data.length; i++) {
    let chave = normalizarChave(data[i][0]);
    if(chave) config[chave] = data[i][1];
  }
  return config;
}

function lerAba(nomeAba, limite = 0) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nomeAba);
  if (!sheet) return [];
  
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  
  let startRow = 2;
  let numRows = lastRow - 1;
  
  if (limite > 0 && numRows > limite) {
    startRow = lastRow - limite + 1;
    numRows = limite;
  }
  
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const data = sheet.getRange(startRow, 1, numRows, sheet.getLastColumn()).getValues();
  const result = [];
  
  for (let i = 0; i < data.length; i++) {
    let row = data[i];
    let obj = {};
    let hasData = false;
    for (let j = 0; j < headers.length; j++) {
      let headerName = normalizarChave(headers[j]);
      if (headerName) {
        obj[headerName] = row[j];
        if (row[j] !== "") hasData = true;
      }
    }
    if (hasData) result.push(obj);
  }
  return limite > 0 ? result.reverse() : result;
}

function normalizarChave(texto) {
  if (!texto) return "";
  return texto.toString().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

// ============================================================================
// 🛑 FIM DO CÓDIGO BACKEND
// ============================================================================
*/

// ============================================================================
// 🚀 INÍCIO DO FRONTEND (REACT APP)
// ============================================================================

import React, { useState, useEffect } from 'react';
import { 
  Sword, Scroll, Coins, Hammer, Settings, 
  Package, Ghost, RefreshCw, Wifi, WifiOff, 
  ChevronRight, AlertTriangle, Terminal, X, Save, PlusCircle,
  TrendingUp, Calendar, Trash2, Edit3, Droplet
} from 'lucide-react';

// 🔗 LINK DA SUA API (Verifique se é o mais recente)
const API_URL = "https://script.google.com/macros/s/AKfycbxdLrwDLHBnR88K1wQlk8MEMt9BKcx_7nNuGXZHF9W3f4aaNiDsZZvHZNMli4vjXp8W/exec";

// --- HELPERS ---
const getMoneyVal = (obj, possibleKeys) => {
  if (!obj) return 0;
  let rawVal = undefined;
  for (let k of possibleKeys) {
    if (obj[k] !== undefined) { rawVal = obj[k]; break; }
    if (obj[k.toLowerCase()] !== undefined) { rawVal = obj[k.toLowerCase()]; break; }
    const normK = k.toLowerCase().replace(/_/g, ''); 
    if (obj[normK] !== undefined) { rawVal = obj[normK]; break; }
  }
  if (rawVal === undefined || rawVal === "") return 0;
  if (typeof rawVal === 'number') return rawVal;
  let cleanStr = String(rawVal).replace(/[^\d.,-]/g, "");
  if (cleanStr.includes(',') && cleanStr.includes('.')) cleanStr = cleanStr.replace(/\./g, '').replace(',', '.');
  else if (cleanStr.includes(',')) cleanStr = cleanStr.replace(',', '.');
  const finalNum = parseFloat(cleanStr);
  return isNaN(finalNum) ? 0 : finalNum;
};

const getStringVal = (obj, possibleKeys) => {
  if (!obj) return "";
  for (let k of possibleKeys) {
    if (obj[k]) return String(obj[k]);
    if (obj[k.toLowerCase()]) return String(obj[k.toLowerCase()]);
    const normK = k.toLowerCase().replace(/_/g, '');
    if (obj[normK]) return String(obj[normK]);
  }
  return "";
};

// --- DADOS OFFLINE ---
const DB_OFFLINE = {
  config: { custos_fixos_mensais: 800, horas_operacionais_mes: 160, custo_kwh: 0.95, taxa_falha_media: 0.10, custo_hora_humana: 25 },
  maquinas: [{ id: 'P1', nome: 'OFFLINE MK1', potencia_w: 350, preco_compra: 3500, vida_util_h: 10000, custo_manutencao_ano: 200 }],
  materiais: [{ id: 'F1', marca: 'VOOLT', tipo: 'PLA', cor: 'PRETO', hex: '#1a1a1a', pesoinicial: 1000, pesoatual: 850, precokg: 68.00 }],
  insumos: [{ id: 'I1', item: 'BOX', custo_unit: 2.00 }],
  marketplaces: [{ id: 'M1', nome: 'LOCAL', comissao: 0, taxa_fixa_r$: 0, imposto_nota: 0 }],
  historico_gastos: [],
  historico_vendas: []
};

// --- ESTILOS ---
const RetroStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap');
    .font-retro { font-family: 'Press Start 2P', cursive; }
    .font-term { font-family: 'VT323', monospace; }
    .retro-box { background-color: #fdf6e3; border: 4px solid #2c1a0b; box-shadow: 6px 6px 0px #000000; image-rendering: pixelated; }
    .retro-btn { transition: all 0.1s; box-shadow: 3px 3px 0px #000000; border: 2px solid #000; }
    .retro-btn:active { transform: translate(2px, 2px); box-shadow: 1px 1px 0px #000000; }
    .retro-input { background-color: #fff; border: 2px solid #2c1a0b; font-family: 'VT323', monospace; font-size: 1.3rem; color: #000; padding: 0.2rem 0.5rem; }
    @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
    .blink { animation: blink 1s infinite; }
    ::-webkit-scrollbar { width: 10px; }
    ::-webkit-scrollbar-track { background: #2c1a0b; }
    ::-webkit-scrollbar-thumb { background: #d97706; border: 2px solid #2c1a0b; }
  `}</style>
);

const RetroCard = ({ title, children, color = "border-gray-800", icon: Icon }) => (
  <div className={`retro-box p-4 mb-6 relative ${color} transition-all`}>
    <div className="flex justify-between items-center mb-4 border-b-2 border-black/10 pb-2">
      <div className="font-retro text-xs md:text-sm text-amber-700 uppercase flex items-center gap-2">
        {Icon && <Icon size={16} />}
        {title}
      </div>
      <div className="flex gap-1">
        <div className="w-2 h-2 rounded-full bg-red-400 border border-black"></div>
        <div className="w-2 h-2 rounded-full bg-yellow-400 border border-black"></div>
        <div className="w-2 h-2 rounded-full bg-green-400 border border-black"></div>
      </div>
    </div>
    {children}
  </div>
);

const SpoolGauge = ({ hex = "#333", current, total }) => {
  const safeTotal = total > 0 ? total : 1000;
  const percentage = Math.min(100, Math.max(0, (current / safeTotal) * 100));
  const isLow = percentage < 20;
  const safeHex = hex && hex.startsWith('#') ? hex : '#333333';
  const style = {
    background: `conic-gradient(${safeHex} ${percentage}%, #e5e7eb ${percentage}% 100%)`,
    boxShadow: `0 0 10px ${safeHex}40`
  };

  return (
    <div className="relative w-24 h-24 rounded-full flex items-center justify-center border-4 border-gray-300 transition-all duration-500" style={style}>
      <div className="absolute w-16 h-16 bg-white rounded-full flex flex-col items-center justify-center border border-gray-200 z-10 shadow-inner">
        <span className={`font-term text-lg font-bold ${isLow ? 'text-red-600 animate-pulse' : 'text-gray-800'}`}>
          {percentage.toFixed(0)}%
        </span>
      </div>
      {isLow && <div className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 border-2 border-white z-20 shadow-md"><AlertTriangle size={12} /></div>}
    </div>
  );
};

const BootScreen = ({ error, onRetry, onOffline }) => (
  <div className="min-h-screen bg-black text-green-500 font-term text-xl p-8 flex flex-col justify-center items-center">
    <div className="max-w-2xl w-full space-y-2">
      <p>PRINT QUEST BIOS v5.2</p>
      <p>LOADING SYSTEM... OK</p>
      <p>CONNECTING... <span className={error ? "text-red-500" : "blink"}>{error ? "ERROR" : "_"}</span></p>
      {error && (
        <div className="border-2 border-red-500 p-4 mt-8 bg-red-900/20 text-red-500 animate-in fade-in">
          <div className="font-mono text-sm bg-black p-3 border border-red-800 mb-4">{error}</div>
          <div className="flex gap-4">
            <button onClick={onRetry} className="flex-1 border border-red-500 px-4 py-3 hover:bg-red-500 hover:text-white uppercase font-retro text-xs">Retry</button>
            <button onClick={onOffline} className="flex-1 border border-gray-500 text-gray-400 px-4 py-3 hover:bg-gray-700 hover:text-white uppercase font-retro text-xs">Offline Mode</button>
          </div>
        </div>
      )}
    </div>
  </div>
);

// --- STOCK MANAGER ---
const StockManager = ({ db, onUpdateStock }) => {
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({});
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const materials = db.materiais || [];

  const handleEdit = (mat) => {
    // Carrega dados normalizados do banco para o form
    setFormData({
      id: mat.id,
      marca: getStringVal(mat, ['marca']),
      tipo: getStringVal(mat, ['tipo']),
      cor: getStringVal(mat, ['cor']),
      hex: getStringVal(mat, ['hex']) || '#000000',
      peso_inicial: getMoneyVal(mat, ['pesoinicial', 'peso_inicial', 'peso_inicial_g']),
      peso_atual: getMoneyVal(mat, ['pesoatual', 'peso_atual', 'peso_atual_g']),
      preco: getMoneyVal(mat, ['precokg', 'preco_kg', 'preco'])
    });
    setEditingId(mat.id);
    setIsNew(false);
  };

  const handleNew = () => {
    setFormData({ marca: "", tipo: "PLA", cor: "", hex: "#000000", peso_inicial: 1000, peso_atual: 1000, preco: 0 });
    setEditingId("NEW");
    setIsNew(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const action = isNew ? "novo_material" : "editar_material";
    // Manda os dados com os nomes que o Backend espera (com underscore se o backend usa array posicional ou nomes especificos)
    await onUpdateStock({ ...formData, action });
    setSaving(false);
    setEditingId(null);
  };

  const handleDelete = async (id) => {
    if(!confirm("Tem certeza que quer remover este filamento do inventário?")) return;
    setDeletingId(id);
    // Timeout maior para garantir que o Google Apps Script processe antes de recarregar
    await onUpdateStock({ action: "deletar_material", id }, 3000); 
    setDeletingId(null);
  };

  return (
    <div className="animate-in fade-in">
      <div className="flex justify-end mb-6">
        <button onClick={handleNew} className="retro-btn bg-blue-600 text-white px-4 py-2 font-retro text-xs flex gap-2 items-center">
          <PlusCircle size={16}/> NOVO CARRETEL
        </button>
      </div>

      {editingId && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="retro-box bg-[#fdf6e3] w-full max-w-lg p-6 relative">
            <button onClick={() => setEditingId(null)} className="absolute top-2 right-2 text-gray-500 hover:text-red-500"><X/></button>
            <h2 className="font-retro text-sm text-amber-700 mb-4 border-b-2 border-black/10 pb-2">
              {isNew ? "NOVO ITEM" : "EDITAR ITEM"}
            </h2>
            
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div><label className="font-term text-gray-500">Marca</label><input className="retro-input w-full" value={formData.marca} onChange={e => setFormData({...formData, marca: e.target.value})} /></div>
              <div><label className="font-term text-gray-500">Tipo (Tag)</label><input className="retro-input w-full" value={formData.tipo} onChange={e => setFormData({...formData, tipo: e.target.value})} /></div>
            </div>
            
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div><label className="font-term text-gray-500">Cor (Nome)</label><input className="retro-input w-full" value={formData.cor} onChange={e => setFormData({...formData, cor: e.target.value})} /></div>
              <div>
                <label className="font-term text-gray-500 flex items-center gap-2">Cor (Hex) <div className="w-4 h-4 border border-black" style={{background: formData.hex}}></div></label>
                <div className="flex gap-2">
                  <input type="color" className="w-10 h-10 border-2 border-black p-0 cursor-pointer" value={formData.hex} onChange={e => setFormData({...formData, hex: e.target.value})} />
                  <input className="retro-input flex-1 uppercase" value={formData.hex} onChange={e => setFormData({...formData, hex: e.target.value})} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-6">
              <div><label className="font-term text-gray-500">Total (g)</label><input type="number" className="retro-input w-full text-right" value={formData.peso_inicial} onChange={e => setFormData({...formData, peso_inicial: Number(e.target.value)})} /></div>
              <div><label className="font-term text-gray-500">Atual (g)</label><input type="number" className="retro-input w-full text-right" value={formData.peso_atual} onChange={e => setFormData({...formData, peso_atual: Number(e.target.value)})} /></div>
              <div><label className="font-term text-gray-500">R$/Kg</label><input type="number" className="retro-input w-full text-right" value={formData.preco} onChange={e => setFormData({...formData, preco: Number(e.target.value)})} /></div>
            </div>

            <button onClick={handleSave} disabled={saving} className="w-full retro-btn bg-green-600 text-white py-3 font-retro text-xs flex justify-center gap-2">
              {saving ? <RefreshCw className="animate-spin"/> : <Save size={16}/>} SALVAR DADOS
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {materials.map(mat => {
          // Busca robusta de valores, tolerando nomes como 'peso_inicial' e 'pesoinicial'
          const total = getMoneyVal(mat, ['pesoinicial', 'peso_inicial', 'peso_inicial_g']);
          const current = getMoneyVal(mat, ['pesoatual', 'peso_atual', 'peso_atual_g']);
          const hex = getStringVal(mat, ['hex']);
          const isDeleting = deletingId === mat.id;
          
          return (
            <RetroCard key={mat.id} title={getStringVal(mat, ['marca'])} color={isDeleting ? "border-red-500 opacity-50" : "border-gray-400"}>
              <div className="flex gap-4 items-center">
                <div className="flex-shrink-0">
                  <SpoolGauge hex={hex} current={current} total={total} />
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex justify-between items-start">
                    <span className="font-retro text-xs bg-gray-200 px-2 py-1 rounded text-gray-700">{getStringVal(mat, ['tipo'])}</span>
                    <span className="font-term text-gray-400 text-sm">#{mat.id}</span>
                  </div>
                  <h3 className="font-bold text-gray-800 leading-tight">{getStringVal(mat, ['cor'])}</h3>
                  <div className="font-term text-gray-500 text-sm">Restante: <span className={current < total*0.2 ? "text-red-600 font-bold" : "text-gray-800"}>{current}g</span></div>
                  <div className="font-term text-gray-500 text-sm">Valor: R$ {getMoneyVal(mat, ['precokg', 'preco_kg', 'preco']).toFixed(2)}/kg</div>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-gray-200 flex justify-end gap-2">
                {isDeleting ? (
                  <span className="text-red-600 font-retro text-xs animate-pulse">DELETANDO...</span>
                ) : (
                  <>
                    <button onClick={() => handleEdit(mat)} className="text-gray-500 hover:text-blue-600 p-1"><Edit3 size={18}/></button>
                    <button onClick={() => handleDelete(mat.id)} className="text-gray-500 hover:text-red-600 p-1"><Trash2 size={18}/></button>
                  </>
                )}
              </div>
            </RetroCard>
          )
        })}
      </div>
    </div>
  );
};

// --- CALCULADORA (VENDA) ---
const CalculadoraMaster = ({ db, offlineMode, onSaveSale }) => {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [productName, setProductName] = useState("");
  
  const [inputs, setInputs] = useState({
    maquinaId: db.maquinas?.[0]?.id || '',
    materialId: db.materiais?.[0]?.id || '',
    pesoPeca: 120, pesoSuporte: 20, tempoPrint: 4.5,
    tempoSetup: 15, tempoPos: 20,
    insumoId: db.insumos?.[0]?.id || '', embalagemId: '',
    marketplaceId: db.marketplaces?.[0]?.id || '',
    margemLucro: 30, custoFrete: 0, investimentoMkt: 5.00
  });

  if (!db.maquinas || !db.maquinas.length) return <div className="text-red-500 font-term">ERRO: DB VAZIO</div>;

  const getVal = (obj, keys, def = 0) => getMoneyVal(obj, keys) || def;

  const maq = db.maquinas.find(m => m.id === inputs.maquinaId) || db.maquinas[0];
  const mat = db.materiais.find(m => m.id === inputs.materialId) || db.materiais[0];
  const mkt = db.marketplaces.find(m => m.id === inputs.marketplaceId) || db.marketplaces[0];
  const insumo = db.insumos?.find(i => i.id === inputs.insumoId);
  const emb = db.insumos?.find(i => i.id === inputs.embalagemId);

  const config = {
    custoFixo: getVal(db.config, ['custos_fixos_mensais']),
    horasMes: getVal(db.config, ['horas_operacionais_mes']),
    kwh: getVal(db.config, ['custo_kwh']),
    falha: getVal(db.config, ['taxa_falha_media']),
    horaHumana: getVal(db.config, ['custo_hora_humana'])
  };

  const pesoTotal = inputs.pesoPeca + inputs.pesoSuporte;
  const custoFilamento = (pesoTotal / 1000) * getVal(mat, ['precokg', 'preco_kg', 'preco']);
  const custoFalha = custoFilamento * config.falha;
  
  const custoEnergia = inputs.tempoPrint * (getVal(maq, ['potencia_w', 'potencia']) / 1000) * config.kwh;
  const custoDeprec = (getVal(maq, ['preco_compra', 'preco']) / getVal(maq, ['vida_util_h', 'vidah'], 5000)) * inputs.tempoPrint;
  const custoManut = (getVal(maq, ['custo_manutencao_ano', 'manutano'], 100) / (config.horasMes * 12)) * inputs.tempoPrint;
  const custoMaquina = custoEnergia + custoDeprec + custoManut;

  const custoMaoObra = ((inputs.tempoSetup + inputs.tempoPos) / 60) * config.horaHumana;
  const custoFixoRateio = (config.custoFixo / config.horasMes) * inputs.tempoPrint;
  const custoInsumos = (insumo ? getVal(insumo, ['custo_unit', 'custo']) : 0) + (emb ? getVal(emb, ['custo_unit', 'custo']) : 0);

  const custoProducao = custoFilamento + custoFalha + custoMaquina + custoMaoObra + custoFixoRateio + custoInsumos;

  let comissao = getVal(mkt, ['comissao']); if (comissao > 1) comissao /= 100;
  let imposto = getVal(mkt, ['imposto_nota', 'imposto']); if (imposto > 1) imposto /= 100;
  const taxaFixa = getVal(mkt, ['taxa_fixa_r$', 'taxafixa']);
  const margem = inputs.margemLucro / 100;
  
  const denominador = 1 - (comissao + imposto + margem);
  const custosVendaFixos = taxaFixa + inputs.custoFrete + inputs.investimentoMkt;
  const precoVenda = denominador > 0 ? (custoProducao + custosVendaFixos) / denominador : 0;
  const lucroLiquido = precoVenda - (custoProducao + custosVendaFixos + (precoVenda * comissao) + (precoVenda * imposto));

  const handleSave = async () => {
    if (!productName) return alert("Nome do produto obrigatório!");
    setSaving(true);
    await onSaveSale({
      action: "nova_venda",
      produto: productName,
      material: `${getStringVal(mat, ['marca'])} ${getStringVal(mat, ['tipo'])}`,
      materialId: mat.id, 
      peso: pesoTotal,
      custo: custoProducao,
      venda: precoVenda,
      lucro: lucroLiquido,
      canal: getStringVal(mkt, ['nome'])
    });
    setSaving(false);
    setProductName("");
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in">
      <div>
        <RetroCard title="Parâmetros" icon={Settings} color="border-gray-600">
          <div className="flex border-b-2 border-black/10 mb-4 pb-2 gap-4">
            {[1, 2, 3].map(s => <button key={s} onClick={() => setStep(s)} className={`font-retro text-xs ${step===s ? 'text-amber-600 underline' : 'text-gray-400'}`}>STEP {s}</button>)}
          </div>
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block font-term text-gray-500">Máquina</label><select className="retro-input w-full" value={inputs.maquinaId} onChange={e => setInputs({...inputs, maquinaId: e.target.value})}>{db.maquinas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}</select></div>
                <div><label className="block font-term text-gray-500">Material</label><select className="retro-input w-full" value={inputs.materialId} onChange={e => setInputs({...inputs, materialId: e.target.value})}>{db.materiais.map(m => <option key={m.id} value={m.id}>{getStringVal(m, ['marca'])} {getStringVal(m, ['tipo'])} ({getStringVal(m, ['cor'])})</option>)}</select></div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div><label className="block font-term text-gray-500">Peça (g)</label><input type="number" className="retro-input w-full text-right" value={inputs.pesoPeca} onChange={e => setInputs({...inputs, pesoPeca: Number(e.target.value)})} /></div>
                <div><label className="block font-term text-gray-500">Suporte</label><input type="number" className="retro-input w-full text-right text-red-600" value={inputs.pesoSuporte} onChange={e => setInputs({...inputs, pesoSuporte: Number(e.target.value)})} /></div>
                <div><label className="block font-term text-gray-500">Tempo (h)</label><input type="number" className="retro-input w-full text-right" value={inputs.tempoPrint} onChange={e => setInputs({...inputs, tempoPrint: Number(e.target.value)})} /></div>
              </div>
            </div>
          )}
          {step === 2 && (
             <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block font-term text-gray-500">Setup (min)</label><input type="number" className="retro-input w-full text-right" value={inputs.tempoSetup} onChange={e => setInputs({...inputs, tempoSetup: Number(e.target.value)})} /></div>
                  <div><label className="block font-term text-gray-500">Pós (min)</label><input type="number" className="retro-input w-full text-right" value={inputs.tempoPos} onChange={e => setInputs({...inputs, tempoPos: Number(e.target.value)})} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                   <div><label className="block font-term text-gray-500">Insumo</label><select className="retro-input w-full" value={inputs.insumoId} onChange={e => setInputs({...inputs, insumoId: e.target.value})}><option value="">Nenhum</option>{db.insumos?.map(i => <option key={i.id} value={i.id}>{i.item}</option>)}</select></div>
                   <div><label className="block font-term text-gray-500">Embalagem</label><select className="retro-input w-full" value={inputs.embalagemId} onChange={e => setInputs({...inputs, embalagemId: e.target.value})}><option value="">Nenhum</option>{db.insumos?.map(i => <option key={i.id} value={i.id}>{i.item}</option>)}</select></div>
                </div>
             </div>
          )}
          {step === 3 && (
            <div className="space-y-4">
              <div><label className="block font-term text-gray-500">Canal</label><select className="retro-input w-full" value={inputs.marketplaceId} onChange={e => setInputs({...inputs, marketplaceId: e.target.value})}>{db.marketplaces?.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}</select></div>
              <div className="grid grid-cols-2 gap-4">
                 <div><label className="block font-term text-blue-600">Margem %</label><input type="number" className="retro-input w-full text-right text-blue-800 font-bold" value={inputs.margemLucro} onChange={e => setInputs({...inputs, margemLucro: Number(e.target.value)})} /></div>
                 <div><label className="block font-term text-gray-500">Mkt (R$)</label><input type="number" className="retro-input w-full text-right" value={inputs.investimentoMkt} onChange={e => setInputs({...inputs, investimentoMkt: Number(e.target.value)})} /></div>
              </div>
            </div>
          )}
        </RetroCard>
      </div>

      <div>
        <RetroCard title="Oráculo Financeiro" icon={Scroll} color="border-amber-700">
           <div className="bg-white p-4 font-term text-lg border-2 border-dashed border-gray-400 relative">
             <div className="flex justify-between font-bold border-b border-black mb-2"><span>CUSTO TOTAL</span> <span>R$ {custoProducao.toFixed(2)}</span></div>
             <div className="flex justify-between font-bold border-b border-black mb-4"><span>TAXAS/EXTRAS</span> <span>R$ {(precoVenda - custoProducao - lucroLiquido).toFixed(2)}</span></div>
             <div className="flex justify-between items-center text-green-700">
               <span className="font-retro text-xs">LUCRO</span><span className="text-2xl font-bold">R$ {lucroLiquido.toFixed(2)}</span>
             </div>
             <div className="flex justify-between items-center mt-2 text-blue-700">
               <span className="font-retro text-xs">VENDA</span><span className="text-3xl font-bold underline">R$ {precoVenda.toFixed(2)}</span>
             </div>
           </div>
           
           <div className="mt-4 space-y-2">
             <input type="text" placeholder="Nome do Produto (ex: Vaso Dragon)" className="retro-input w-full mb-2" value={productName} onChange={e => setProductName(e.target.value)} />
             <button onClick={handleSave} disabled={saving || offlineMode} className={`w-full retro-btn py-3 font-retro text-xs text-white flex items-center justify-center gap-2 ${saving ? 'bg-gray-500' : 'bg-green-500 hover:bg-green-400'}`}>
               {saving ? <RefreshCw className="animate-spin" /> : <Save size={16} />} 
               {saving ? "GRAVANDO..." : "REGISTRAR VENDA & BAIXAR ESTOQUE"}
             </button>
           </div>
        </RetroCard>
      </div>
    </div>
  );
};

// --- GESTÃO DE GASTOS (LOOT) ---
const GastosManager = ({ db, onSaveExpense }) => {
  const [item, setItem] = useState("");
  const [valor, setValor] = useState("");
  const [cat, setCat] = useState("MATERIA_PRIMA");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!item || !valor) return alert("Preencha item e valor");
    setSaving(true);
    await onSaveExpense({ action: "novo_gasto", item, categoria: cat, valor: Number(valor) });
    setSaving(false); setItem(""); setValor("");
  };

  return (
    <div className="animate-in fade-in">
      <RetroCard title="Registrar Loot (Despesa)" icon={Package} color="border-red-700">
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1 w-full"><label className="font-term text-gray-500">Item</label><input className="retro-input w-full" value={item} onChange={e => setItem(e.target.value)} placeholder="Ex: Manutenção Bico" /></div>
          <div className="w-full md:w-32"><label className="font-term text-gray-500">Valor (R$)</label><input type="number" className="retro-input w-full" value={valor} onChange={e => setValor(e.target.value)} placeholder="0.00" /></div>
          <div className="w-full md:w-48"><label className="font-term text-gray-500">Categoria</label><select className="retro-input w-full" value={cat} onChange={e => setCat(e.target.value)}><option value="MATERIA_PRIMA">Matéria Prima</option><option value="MANUTENCAO">Manutenção</option><option value="FERRAMENTA">Ferramenta</option><option value="FIXO">Custo Fixo</option></select></div>
          <button onClick={handleSave} disabled={saving} className="retro-btn bg-red-600 text-white p-3 md:w-auto w-full flex justify-center">{saving ? <RefreshCw className="animate-spin" /> : <PlusCircle />}</button>
        </div>
      </RetroCard>
      <RetroCard title="Histórico Recente" icon={Scroll} color="border-gray-500">
        <table className="w-full font-term text-lg text-left">
          <thead className="border-b-2 border-black"><tr><th className="p-2">DATA</th><th className="p-2">ITEM</th><th className="p-2 text-right">VALOR</th></tr></thead>
          <tbody>
            {db.historico_gastos?.map((g, i) => (
              <tr key={i} className="border-b border-gray-300">
                <td className="p-2 text-gray-500">{new Date(g.data).toLocaleDateString()}</td><td className="p-2">{g.item}</td><td className="p-2 text-right text-red-600">- R$ {getMoneyVal(g, ['valor']).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </RetroCard>
    </div>
  );
};

// --- GESTÃO DE VENDAS (SALES) ---
const SalesManager = ({ db }) => {
  const sales = db.historico_vendas || [];
  const totalRevenue = sales.reduce((acc, curr) => acc + getMoneyVal(curr, ['venda', 'vendafinal']), 0);
  const totalProfit = sales.reduce((acc, curr) => acc + getMoneyVal(curr, ['lucro', 'lucroreal']), 0);

  return (
    <div className="animate-in fade-in">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <RetroCard title="Faturamento (Recente)" icon={Coins} color="border-green-600"><div className="text-center py-2"><span className="font-term text-4xl text-green-700">R$ {totalRevenue.toFixed(2)}</span><p className="text-xs font-retro text-gray-500 mt-2">TOTAL LISTADO</p></div></RetroCard>
        <RetroCard title="Lucro Líquido (Recente)" icon={TrendingUp} color="border-blue-600"><div className="text-center py-2"><span className="font-term text-4xl text-blue-700">R$ {totalProfit.toFixed(2)}</span><p className="text-xs font-retro text-gray-500 mt-2">MARGEM REAL</p></div></RetroCard>
      </div>
      <RetroCard title="Histórico de Vendas" icon={Scroll} color="border-gray-500">
        <div className="overflow-x-auto">
          <table className="w-full font-term text-lg text-left">
            <thead className="border-b-2 border-black bg-gray-100"><tr><th className="p-3"><Calendar size={14}/> DATA</th><th className="p-3">PRODUTO</th><th className="p-3">CANAL</th><th className="p-3 text-right">VENDA</th><th className="p-3 text-right">LUCRO</th></tr></thead>
            <tbody>
              {sales.map((v, i) => (
                <tr key={i} className="border-b border-gray-300 hover:bg-white transition-colors"><td className="p-3 text-gray-500 text-sm">{new Date(v.data).toLocaleDateString()}</td><td className="p-3 font-bold text-gray-800">{v.produto}</td><td className="p-3"><span className="text-[10px] bg-gray-200 px-2 py-1 rounded font-retro text-gray-600">{v.canal}</span></td><td className="p-3 text-right text-green-700 font-bold">R$ {getMoneyVal(v, ['venda', 'vendafinal']).toFixed(2)}</td><td className="p-3 text-right text-blue-600">R$ {getMoneyVal(v, ['lucro', 'lucroreal']).toFixed(2)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </RetroCard>
    </div>
  );
};

// --- APP PRINCIPAL ---
export default function PrintQuestOS() {
  const [activeTab, setActiveTab] = useState('calc');
  const [db, setDb] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [offlineMode, setOfflineMode] = useState(false);
  const [toast, setToast] = useState(null);

  const fetchData = async () => {
    try {
      const res = await fetch(API_URL, { method: "GET", credentials: "omit" });
      if (!res.ok) throw new Error("Connection failed");
      const data = await res.json();
      setDb(data); setLoading(false);
    } catch (err) {
      console.error(err);
      setToast({type: 'error', msg: "Falha na conexão. Ativando modo offline."});
      setDb(DB_OFFLINE); setOfflineMode(true); setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // Delay aumentado para 3000ms para garantir que o Google processe a deleção
  const sendData = async (payload, delay = 3000) => {
    try {
      await fetch(API_URL, { method: "POST", mode: "no-cors", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      setToast({type: 'success', msg: "Dados gravados no Grimório!"});
      setTimeout(fetchData, delay);
    } catch (e) {
      setToast({type: 'error', msg: "Erro ao salvar. Tente novamente."});
    }
  };

  useEffect(() => { if (toast) setTimeout(() => setToast(null), 4000); }, [toast]);

  if (loading && !db) return <BootScreen error={error} onRetry={() => window.location.reload()} onOffline={() => {setDb(DB_OFFLINE); setOfflineMode(true); setLoading(false);}} />;

  return (
    <div className="min-h-screen bg-stone-100 text-gray-800 font-sans pb-12 bg-[url('https://www.transparenttextures.com/patterns/graphy.png')]">
      <RetroStyles />
      {toast && <div className={`fixed top-20 right-4 z-50 px-4 py-3 rounded shadow-lg border-2 border-black font-term flex items-center gap-2 animate-in slide-in-from-right ${toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'}`}>{toast.type === 'error' ? <AlertTriangle size={18}/> : <Save size={18}/>} {toast.msg}</div>}
      
      <header className={`bg-gray-900 border-b-4 ${offlineMode ? 'border-gray-500' : 'border-amber-600'} sticky top-0 z-50 shadow-lg`}>
        <div className="max-w-6xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 ${offlineMode ? 'bg-gray-600' : 'bg-amber-600'} border-2 flex items-center justify-center shadow-[2px_2px_0px_#000]`}>
               <Sword size={20} className="text-white" />
            </div>
            <div>
              <h1 className="font-retro text-yellow-400 text-sm md:text-lg tracking-widest drop-shadow-md">PRINT QUEST</h1>
              <div className="flex items-center gap-2">
                 <div className={`w-2 h-2 rounded-full ${offlineMode ? 'bg-gray-500' : 'bg-green-500 animate-pulse'}`}></div>
                 <p className={`font-term text-lg leading-none ${offlineMode ? 'text-gray-400' : 'text-green-400'}`}>{offlineMode ? 'OFFLINE' : 'ONLINE'}</p>
              </div>
            </div>
          </div>
          <nav className="flex gap-2">
            <button onClick={() => setActiveTab('calc')} className={`retro-btn px-3 py-2 font-retro text-xs flex gap-2 ${activeTab === 'calc' ? 'bg-amber-600 text-white' : 'bg-gray-800 text-gray-400'}`}><Hammer size={14}/> CRAFT</button>
            <button onClick={() => setActiveTab('estoque')} className={`retro-btn px-3 py-2 font-retro text-xs flex gap-2 ${activeTab === 'estoque' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400'}`}><Droplet size={14}/> STOCK</button>
            <button onClick={() => setActiveTab('vendas')} className={`retro-btn px-3 py-2 font-retro text-xs flex gap-2 ${activeTab === 'vendas' ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-400'}`}><Coins size={14}/> SALES</button>
            <button onClick={() => setActiveTab('gastos')} className={`retro-btn px-3 py-2 font-retro text-xs flex gap-2 ${activeTab === 'gastos' ? 'bg-red-700 text-white' : 'bg-gray-800 text-gray-400'}`}><Package size={14}/> LOOT</button>
            <button onClick={() => window.location.reload()} className="retro-btn px-2 bg-gray-800 text-gray-400"><RefreshCw size={14}/></button>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {activeTab === 'calc' && <CalculadoraMaster db={db} offlineMode={offlineMode} onSaveSale={sendData} />}
        {activeTab === 'estoque' && <StockManager db={db} onUpdateStock={sendData} />}
        {activeTab === 'vendas' && <SalesManager db={db} />}
        {activeTab === 'gastos' && <GastosManager db={db} onSaveExpense={sendData} />}
      </main>
    </div>
  );
}
