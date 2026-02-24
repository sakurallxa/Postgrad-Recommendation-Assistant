import { observable, action } from 'mobx-miniprogram'

class SelectionStore {
  constructor() {
    this.initFromStorage()
  }

  @observable
  selectedUniversities = []

  @observable
  selectedMajors = []

  @action
  addUniversity(university) {
    if (!this.selectedUniversities.find(item => item.id === university.id)) {
      this.selectedUniversities.push(university)
      this.saveToStorage()
    }
  }

  @action
  removeUniversity(universityId) {
    this.selectedUniversities = this.selectedUniversities.filter(item => item.id !== universityId)
    this.saveToStorage()
  }

  @action
  addMajor(major) {
    if (!this.selectedMajors.find(item => item.id === major.id)) {
      this.selectedMajors.push(major)
      this.saveToStorage()
    }
  }

  @action
  removeMajor(majorId) {
    this.selectedMajors = this.selectedMajors.filter(item => item.id !== majorId)
    this.saveToStorage()
  }

  @action
  clearAll() {
    this.selectedUniversities = []
    this.selectedMajors = []
    this.saveToStorage()
  }

  @action
  setSelection(universities, majors) {
    this.selectedUniversities = universities
    this.selectedMajors = majors
    this.saveToStorage()
  }

  saveToStorage() {
    wx.setStorageSync('selectedUniversities', this.selectedUniversities)
    wx.setStorageSync('selectedMajors', this.selectedMajors)
  }

  initFromStorage() {
    const universities = wx.getStorageSync('selectedUniversities')
    const majors = wx.getStorageSync('selectedMajors')
    if (universities) {
      this.selectedUniversities = universities
    }
    if (majors) {
      this.selectedMajors = majors
    }
  }
}

export const selectionStore = new SelectionStore()
