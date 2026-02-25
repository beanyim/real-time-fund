/**
 * 数据迁移工具 - 用于多账本功能的数据结构升级
 */

/**
 * 检测是否为老版本数据结构（v1）
 * @param {object} data - 数据对象
 * @returns {boolean}
 */
export function isLegacyData(data) {
  if (!data || typeof data !== 'object') return false;
  // v2 数据有 version 字段且 >= 2
  if (data.version && data.version >= 2) return false;
  // 老数据特征：顶层直接包含 funds 数组
  return Array.isArray(data.funds) || data.holdings !== undefined;
}

/**
 * 生成 UUID
 * @returns {string}
 */
export function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // 降级方案
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * 将老版本数据迁移为 v2 多账本结构
 * @param {object} oldData - 老版本数据
 * @param {string} portfolioName - 账本名称，默认为"默认账本"
 * @returns {object} v2 数据结构
 */
export function migrateToV2(oldData, portfolioName = '默认账本') {
  const portfolioId = generateId();
  const now = new Date().toISOString();

  return {
    version: 2,
    refreshMs: typeof oldData.refreshMs === 'number' && oldData.refreshMs >= 5000 
      ? oldData.refreshMs 
      : 30000,
    portfolios: [
      {
        id: portfolioId,
        name: portfolioName,
        createdAt: now,
        funds: Array.isArray(oldData.funds) ? oldData.funds : [],
        favorites: Array.isArray(oldData.favorites) ? oldData.favorites : [],
        groups: Array.isArray(oldData.groups) ? oldData.groups : [],
        holdings: oldData.holdings && typeof oldData.holdings === 'object' && !Array.isArray(oldData.holdings)
          ? oldData.holdings
          : {},
        pendingTrades: Array.isArray(oldData.pendingTrades) ? oldData.pendingTrades : []
      }
    ]
  };
}

/**
 * 创建空的 v2 数据结构
 * @returns {object}
 */
export function createEmptyV2Data() {
  const portfolioId = generateId();
  const now = new Date().toISOString();

  return {
    version: 2,
    refreshMs: 30000,
    portfolios: [
      {
        id: portfolioId,
        name: '默认账本',
        createdAt: now,
        funds: [],
        favorites: [],
        groups: [],
        holdings: {},
        pendingTrades: []
      }
    ]
  };
}

/**
 * 创建新账本
 * @param {string} name - 账本名称
 * @returns {object} 新账本对象
 */
export function createPortfolio(name) {
  return {
    id: generateId(),
    name: name || '新账本',
    createdAt: new Date().toISOString(),
    funds: [],
    favorites: [],
    groups: [],
    holdings: {},
    pendingTrades: []
  };
}

/**
 * 将老数据合并到指定账本
 * @param {object} portfolio - 目标账本
 * @param {object} oldData - 老版本数据
 * @returns {object} 合并后的账本
 */
export function mergeOldDataToPortfolio(portfolio, oldData) {
  if (!portfolio || !oldData) return portfolio;

  // 基金列表去重合并
  const existingCodes = new Set((portfolio.funds || []).map(f => f.code));
  const newFunds = (oldData.funds || []).filter(f => f && f.code && !existingCodes.has(f.code));
  const mergedFunds = [...(portfolio.funds || []), ...newFunds];
  const allCodes = new Set(mergedFunds.map(f => f.code));

  // 收藏合并去重
  const mergedFavorites = Array.from(new Set([
    ...(portfolio.favorites || []),
    ...(oldData.favorites || [])
  ])).filter(code => allCodes.has(code));

  // 分组合并
  const mergedGroups = [...(portfolio.groups || [])];
  (oldData.groups || []).forEach(incomingGroup => {
    const existingIdx = mergedGroups.findIndex(g => g.id === incomingGroup.id);
    if (existingIdx > -1) {
      mergedGroups[existingIdx] = {
        ...mergedGroups[existingIdx],
        codes: Array.from(new Set([
          ...mergedGroups[existingIdx].codes,
          ...(incomingGroup.codes || [])
        ])).filter(code => allCodes.has(code))
      };
    } else {
      mergedGroups.push({
        ...incomingGroup,
        codes: (incomingGroup.codes || []).filter(code => allCodes.has(code))
      });
    }
  });

  // 持仓合并
  const mergedHoldings = {
    ...(portfolio.holdings || {}),
    ...(oldData.holdings || {})
  };
  // 清理不存在的基金持仓
  Object.keys(mergedHoldings).forEach(code => {
    if (!allCodes.has(code)) delete mergedHoldings[code];
  });

  // 待处理交易合并
  const keyOf = (trade) => {
    if (trade?.id) return `id:${trade.id}`;
    return `k:${trade?.fundCode || ''}:${trade?.type || ''}:${trade?.date || ''}:${trade?.share || ''}:${trade?.amount || ''}:${trade?.isAfter3pm ? 1 : 0}`;
  };
  const pendingMap = new Map();
  (portfolio.pendingTrades || []).forEach(trade => {
    if (trade && allCodes.has(trade.fundCode)) {
      pendingMap.set(keyOf(trade), trade);
    }
  });
  (oldData.pendingTrades || []).forEach(trade => {
    if (trade && allCodes.has(trade.fundCode)) {
      pendingMap.set(keyOf(trade), trade);
    }
  });
  const mergedPending = Array.from(pendingMap.values());

  return {
    ...portfolio,
    funds: mergedFunds,
    favorites: mergedFavorites,
    groups: mergedGroups,
    holdings: mergedHoldings,
    pendingTrades: mergedPending
  };
}

/**
 * 验证 v2 数据结构完整性
 * @param {object} data - v2 数据
 * @returns {object} 修复后的数据
 */
export function validateV2Data(data) {
  if (!data || typeof data !== 'object') {
    return createEmptyV2Data();
  }

  // 确保基本字段存在
  const result = {
    version: 2,
    refreshMs: typeof data.refreshMs === 'number' && data.refreshMs >= 5000 
      ? data.refreshMs 
      : 30000,
    portfolios: []
  };

  // 验证账本数组
  if (Array.isArray(data.portfolios) && data.portfolios.length > 0) {
    result.portfolios = data.portfolios.map(p => ({
      id: p.id || generateId(),
      name: p.name || '未命名账本',
      createdAt: p.createdAt || new Date().toISOString(),
      funds: Array.isArray(p.funds) ? p.funds : [],
      favorites: Array.isArray(p.favorites) ? p.favorites : [],
      groups: Array.isArray(p.groups) ? p.groups : [],
      holdings: p.holdings && typeof p.holdings === 'object' && !Array.isArray(p.holdings)
        ? p.holdings
        : {},
      pendingTrades: Array.isArray(p.pendingTrades) ? p.pendingTrades : []
    }));
  } else {
    // 没有账本，创建默认账本
    result.portfolios = [createPortfolio('默认账本')];
  }

  return result;
}
