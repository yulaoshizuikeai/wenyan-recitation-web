// 学习辅助内容的公共类型定义

/** 难词注音条目 */
export interface PhoneticsEntry {
  /** 难词，如 "芣苢" */
  word: string;
  /** 拼音，如 "fú yǐ" */
  pinyin: string;
  /** 释义，如 "车前草" */
  meaning: string;
  /** 是否为通假字/破读字 */
  isTongjia?: boolean;
}

/** 文章理解内容 */
export interface ArticleUnderstanding {
  /** 整篇大意，2-4 句白话 */
  gist: string;
  /** 逐段串讲，长度与 article.paragraphs 一致 */
  paragraphGists: string[];
}
