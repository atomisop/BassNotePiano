const FIDEL = [
  ["h","ሀ ሁ ሂ ሃ ሄ ህ ሆ"],["l","ለ ሉ ሊ ላ ሌ ል ሎ"],["m","መ ሙ ሚ ማ ሜ ም ሞ"],
  ["s","ሰ ሱ ሲ ሳ ሴ ስ ሶ"],["r","ረ ሩ ሪ ራ ሬ ር ሮ"],["sh","ሸ ሹ ሺ ሻ ሼ ሽ ሾ"],
  ["q","ቀ ቁ ቂ ቃ ቄ ቅ ቆ"],["b","በ ቡ ቢ ባ ቤ ብ ቦ"],["t","ተ ቱ ቲ ታ ቴ ት ቶ"],
  ["ch","ቸ ቹ ቺ ቻ ቼ ች ቾ"],["n","ነ ኑ ኒ ና ኔ ን ኖ"],["ny","ኘ ኙ ኚ ኛ ኜ ኝ ኞ"],
  ["'","አ ኡ ኢ ኣ ኤ እ ኦ"],["k","ከ ኩ ኪ ካ ኬ ክ ኮ"],["w","ወ ዉ ዊ ዋ ዌ ው ዎ"],
  ["z","ዘ ዙ ዚ ዛ ዜ ዝ ዞ"],["zh","ዠ ዡ ዢ ዣ ዤ ዥ ዦ"],["y","የ ዩ ዪ ያ ዬ ይ ዮ"],
  ["d","ደ ዱ ዲ ዳ ዴ ድ ዶ"],["j","ጀ ጁ ጂ ጃ ጄ ጅ ጆ"],["g","ገ ጉ ጊ ጋ ጌ ግ ጎ"],
  ["f","ፈ ፉ ፊ ፋ ፌ ፍ ፎ"],["p","ፐ ፑ ፒ ፓ ፔ ፕ ፖ"]
].map(([c, s]) => ({ c, forms: s.split(" ") }));
const VOWELS = ["ä","u","i","a","e","ə","o"];

const WORDS = [
  { am:"ሰላም", rom:"selam", en:"Hello / Peace", cat:"Greetings" },
  { am:"እንዴት ነህ", rom:"indet neh", en:"How are you? (to a man)", cat:"Greetings" },
  { am:"እንዴት ነሽ", rom:"indet nesh", en:"How are you? (to a woman)", cat:"Greetings" },
  { am:"ደህና ነኝ", rom:"dehna negn", en:"I am fine", cat:"Greetings" },
  { am:"አመሰግናለሁ", rom:"amesegnalehu", en:"Thank you", cat:"Greetings" },
  { am:"እባክህ", rom:"ebakih", en:"Please (to a man)", cat:"Greetings" },
  { am:"ደህና ሁን", rom:"dehna hun", en:"Goodbye", cat:"Greetings" },
  { am:"አዎ", rom:"awo", en:"Yes", cat:"Basics" },
  { am:"አይ", rom:"ay", en:"No", cat:"Basics" },
  { am:"ስምህ ማን ነው", rom:"simih man new", en:"What is your name?", cat:"Basics" },
  { am:"ቤት", rom:"bet", en:"House", cat:"Basics" },
  { am:"ጥሩ", rom:"tiru", en:"Good", cat:"Basics" },
  { am:"ውሃ", rom:"wuha", en:"Water", cat:"Food & Family" },
  { am:"ቡና", rom:"buna", en:"Coffee", cat:"Food & Family" },
  { am:"እንጀራ", rom:"injera", en:"Injera (flatbread)", cat:"Food & Family" },
  { am:"እናት", rom:"inat", en:"Mother", cat:"Food & Family" },
  { am:"አባት", rom:"abat", en:"Father", cat:"Food & Family" },
  { am:"አንድ", rom:"and", en:"1", cat:"Numbers" },
  { am:"ሁለት", rom:"hulet", en:"2", cat:"Numbers" },
  { am:"ሦስት", rom:"sost", en:"3", cat:"Numbers" },
  { am:"አራት", rom:"arat", en:"4", cat:"Numbers" },
  { am:"አምስት", rom:"amist", en:"5", cat:"Numbers" },
  { am:"ስድስት", rom:"sidist", en:"6", cat:"Numbers" },
  { am:"ሰባት", rom:"sebat", en:"7", cat:"Numbers" },
  { am:"ስምንት", rom:"simint", en:"8", cat:"Numbers" },
  { am:"ዘጠኝ", rom:"zetegn", en:"9", cat:"Numbers" },
  { am:"አስር", rom:"asir", en:"10", cat:"Numbers" }
];
