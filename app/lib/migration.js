/**
 * 数据迁移工具 - 用于多账本功能的数据结构
 */

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
 * 验证 v2 数据结构完整性
 * @param {object} data - v2 数据
 * @returns {object} 修复后的数据
 */
export function validateV2Data(data) {
  if (!data || typeof data !== 'object') {
    return {
      version: 2,
      refreshMs: 30000,
      portfolios: [createPortfolio('默认账本')]
    };
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
