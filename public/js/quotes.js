/**
 * 金句数据
 */

const QUOTES = [
  { text: "世界上只有一种英雄主义，就是认清生活的真相后依然热爱它。", source: "罗曼·罗兰" },
  { text: "你不必活成别人喜欢的样子。", source: "毕淑敏" },
  { text: "所有的大人都曾经是小孩，虽然，只有少数的人记得。", source: "小王子" },
  { text: "人生没有白走的路，每一步都算数。", source: "李宗盛" },
  { text: "真正的平静不是避开车马喧嚣，而是在心中修篱种菊。", source: "林徽因" },
  { text: "你今天的努力，是幸运的伏笔。", source: "佚名" },
  { text: "生活不是等待暴风雨过去，而是学会在雨中跳舞。", source: "佚名" },
  { text: "没有人是一座孤岛。", source: "约翰·多恩" },
  { text: "凡是过往，皆为序章。", source: "莎士比亚" },
  { text: "种一棵树最好的时间是十年前，其次是现在。", source: "非洲谚语" },
  { text: "你所浪费的今天，是昨天死去的人奢望的明天。", source: "佚名" },
  { text: "不要因为走得太远，而忘记为什么出发。", source: "纪伯伦" },
  { text: "人生如逆旅，我亦是行人。", source: "苏轼" },
  { text: "接受自己的普通，然后全力以赴地去生活。", source: "佚名" },
  { text: "如果你感到迷茫，那说明你正在成长。", source: "佚名" },
  { text: "别急，你看，年年花开都有时。", source: "佚名" },
  { text: "焦虑是因为你想同时做很多事。", source: "佚名" },
  { text: "允许自己做一个平凡的人。", source: "佚名" },
  { text: "你值得被爱，也值得爱自己。", source: "佚名" },
  { text: "每一个不曾起舞的日子，都是对生命的辜负。", source: "尼采" },
  { text: "生命中遇到的问题，都是为了让你成为更好的自己。", source: "佚名" },
  { text: "不是所有的坚持都有结果，但总有一些坚持，能从冰封的土地里，培育出十万朵怒放的蔷薇。", source: "八月长安" },
  { text: "人总是在接近幸福时倍感幸福，在幸福进行时却患得患失。", source: "张爱玲" },
  { text: "每个人都在愤世嫉俗，每个人又都在同流合污。", source: "钱钟书" },
  { text: "所谓无底深渊，下去，也是前程万里。", source: "木心" },
  { text: "我用尽了全力，过着平凡的一生。", source: "毛姆" },
  { text: "温柔要有，但不是妥协。我们要在安静中，不慌不忙地刚强。", source: "三毛" },
  { text: "心之所向，素履以往。", source: "七堇年" },
  { text: "愿你出走半生，归来仍是少年。", source: "佚名" },
  { text: "人生是一袭华美的袍，爬满了蚤子。", source: "张爱玲" },
  { text: "浮生若梦，为欢几何。", source: "李白" },
  { text: "岁月不居，时节如流。", source: "孔子" },
  { text: "你担心的事，99%都不会发生。", source: "认知心理学" },
  { text: "完成比完美更重要。", source: "Facebook格言" },
  { text: "今天很残酷，明天更残酷，后天很美好，但大部分人死在明天晚上。", source: "马云" },
  { text: "人生就像一盒巧克力，你永远不知道下一颗是什么味道。", source: "阿甘正传" },
  { text: "有些事情，不是看到希望才坚持，而是坚持了才会看到希望。", source: "佚名" }
];

const AFFIRMATIONS = [
  "今天也要对自己温柔一点",
  "你已经很棒了",
  "允许自己休息一下",
  "你的感受是valid的",
  "不完美也没关系",
  "慢慢来，不着急",
  "你值得被善待",
  "先照顾好自己",
  "今天也辛苦了",
  "你不必假装坚强",
  "休息不是偷懒",
  "你的努力有人看见",
  "给自己一个拥抱吧",
  "今天的你很勇敢",
  "你已经尽力了"
];

/**
 * 获取随机金句
 */
function getRandomQuote() {
  return QUOTES[Math.floor(Math.random() * QUOTES.length)];
}

/**
 * 获取随机肯定语
 */
function getRandomAffirmation() {
  return AFFIRMATIONS[Math.floor(Math.random() * AFFIRMATIONS.length)];
}

/**
 * 初始化金句显示
 */
function initQuotes() {
  const quote = getRandomQuote();
  const quoteText = document.getElementById('quoteText');
  const quoteSource = document.getElementById('quoteSource');

  if (quoteText && quoteSource) {
    quoteText.textContent = quote.text;
    quoteSource.textContent = `— ${quote.source}`;
  }

  const affirmation = document.getElementById('dailyAffirmation');
  if (affirmation) {
    affirmation.textContent = getRandomAffirmation();
  }
}

// 页面加载后初始化
document.addEventListener('DOMContentLoaded', initQuotes);
