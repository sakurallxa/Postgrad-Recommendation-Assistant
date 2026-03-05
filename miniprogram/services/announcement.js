const ANNOUNCEMENT_TYPES = {
  SUMMER_CAMP: 'summer_camp',
  PRE_RECOMMENDATION: 'pre_recommendation'
}

const PRE_RECOMMENDATION_PATTERN = /(预推免|推免生|推荐免试|推免申请|推免)/i
const SUMMER_CAMP_PATTERN = /(夏令营|暑期学校|暑期营)/i

function resolveTypeFromRaw(rawType = '') {
  if (!rawType) return ''

  const normalized = String(rawType).trim().toLowerCase().replace(/-/g, '_')

  if (
    normalized === ANNOUNCEMENT_TYPES.PRE_RECOMMENDATION ||
    PRE_RECOMMENDATION_PATTERN.test(normalized) ||
    normalized.indexOf('pre_recommendation') > -1 ||
    normalized.indexOf('recommendation') > -1
  ) {
    return ANNOUNCEMENT_TYPES.PRE_RECOMMENDATION
  }

  if (
    normalized === ANNOUNCEMENT_TYPES.SUMMER_CAMP ||
    SUMMER_CAMP_PATTERN.test(normalized) ||
    normalized.indexOf('summer_camp') > -1 ||
    normalized.indexOf('summer') > -1
  ) {
    return ANNOUNCEMENT_TYPES.SUMMER_CAMP
  }

  return ''
}

function inferAnnouncementType(source = {}) {
  const rawType = source.announcementType ||
    source.announcement_type ||
    source.type ||
    source.noticeType ||
    ''
  const typeFromRaw = resolveTypeFromRaw(rawType)

  // 显式类型字段优先，避免被标题/正文关键词误覆盖
  if (typeFromRaw) {
    return typeFromRaw
  }

  const mergedText = [
    source.announcementTypeLabel || source.announcement_type_label || '',
    source.title || '',
    source.sourceUrl || source.source_url || '',
    source.content || ''
  ].join(' ')

  if (PRE_RECOMMENDATION_PATTERN.test(mergedText)) {
    return ANNOUNCEMENT_TYPES.PRE_RECOMMENDATION
  }

  if (SUMMER_CAMP_PATTERN.test(mergedText)) {
    return ANNOUNCEMENT_TYPES.SUMMER_CAMP
  }

  return ANNOUNCEMENT_TYPES.SUMMER_CAMP
}

function getAnnouncementTypeLabel(type) {
  return type === ANNOUNCEMENT_TYPES.PRE_RECOMMENDATION ? '预推免公告' : '夏令营公告'
}

function normalizeAnnouncementType(source = {}) {
  const announcementType = inferAnnouncementType(source)
  return {
    ...source,
    announcementType,
    announcementTypeLabel: getAnnouncementTypeLabel(announcementType)
  }
}

module.exports = {
  ANNOUNCEMENT_TYPES,
  inferAnnouncementType,
  getAnnouncementTypeLabel,
  normalizeAnnouncementType
}
