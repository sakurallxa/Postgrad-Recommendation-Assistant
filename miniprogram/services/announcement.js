const ANNOUNCEMENT_TYPES = {
  SUMMER_CAMP: 'summer_camp',
  PRE_RECOMMENDATION: 'pre_recommendation'
}

const PRE_RECOMMENDATION_PATTERN = /(预推免|推免生|推荐免试|推免申请|推免)/i
const SUMMER_CAMP_PATTERN = /(夏令营|暑期学校|暑期营)/i

function inferAnnouncementType(source = {}) {
  const rawType = source.announcementType || source.announcement_type || ''
  if (rawType === ANNOUNCEMENT_TYPES.PRE_RECOMMENDATION || rawType === ANNOUNCEMENT_TYPES.SUMMER_CAMP) {
    return rawType
  }

  const mergedText = [
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
