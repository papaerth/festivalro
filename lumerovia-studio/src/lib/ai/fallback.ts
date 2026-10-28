import type { StyleOption, TitleCandidate } from "@/lib/types";
import { EMOTIONS } from "@/lib/types";
import { uid } from "@/lib/utils";
import { analyzeLyrics, countSyllables } from "@/lib/lyricsAnalysis";

/**
 * Offline sample generators. Used when ANTHROPIC_API_KEY is missing or the AI call fails,
 * so the whole studio flow still works end-to-end. Output is labeled "sample" in the UI.
 */

const LANDSCAPES = [
  "담양 메타세쿼이아길 가을", "제주 성산일출봉 새벽", "순천만 갈대밭 노을", "강릉 경포 해변 겨울 아침", "안동 하회마을 저녁",
  "내장산 단풍 숲길", "보성 녹차밭 안개", "설악산 울산바위 첫눈", "남해 다랭이마을 봄", "춘천 소양강 물안개",
  "진해 벚꽃길 밤", "영월 선암마을 한반도지형", "여수 밤바다", "하동 십리벚꽃길", "평창 대관령 양떼목장",
  "경주 첨성대 벚꽃 밤", "부산 해동용궁사 일출", "전주 한옥마을 눈 내리는 밤", "제주 오름 억새 바람", "울릉도 해안 절벽",
];

const LANDSCAPE_EN: Record<string, string> = {
  담양: "a long avenue of autumn trees", 제주: "the island dawn above the sea", 순천: "golden reeds at sunset", 강릉: "a quiet winter shore",
  안동: "old tiled roofs at dusk", 내장산: "a maple-red mountain path", 보성: "green hills lost in morning mist", 설악산: "the first snow on granite peaks",
  남해: "terraced fields above the blue bay", 춘천: "mist rising from the river", 진해: "cherry blossoms in the night", 영월: "a slow river bending home",
  여수: "harbor lights across the night water", 하동: "ten miles of blossoms", 평창: "sheep on the high green ridge", 경주: "ancient stones under spring petals",
  부산: "a temple facing the sunrise sea", 전주: "snow on old wooden gates", 울릉도: "cliffs above the far blue", default: "the quiet Korean countryside",
};

function landscapeEn(ko: string): string {
  const key = Object.keys(LANDSCAPE_EN).find((k) => ko.startsWith(k));
  return LANDSCAPE_EN[key ?? "default"];
}

const TITLE_BANK: Record<string, { title: string; titleKo: string; story: string; vocal: string; genre: string }[]> = {
  nostalgia: [
    { title: "Where the Old Road Bends", titleKo: "옛길이 굽어지는 곳", story: "은퇴한 남자가 젊은 시절 매일 걷던 고향의 가로수길을 수십 년 만에 다시 찾는다. 나무는 더 높아졋고 길은 그대로인데, 그 길 끝에서 기다리던 사람만 없다. 그는 길의 끝에서 멈춰 서서 지나온 세월을 따뜻하게 받아들인다.", vocal: "warm mature male baritone", genre: "Cinematic Nostalgic Soft Rock" },
    { title: "Photographs in Amber Light", titleKo: "호박빛 속의 사진들", story: "다락방에서 발견한 낡은 앨범. 노을빛이 창으로 쏟아지는 저녁, 한 여자가 사진 속 젊은 부모와 어린 자신을 마주한다. 사진은 바래도 그날의 웃음은 바래지 않았다는 것을 깨닫는 이야기.", vocal: "warm mature female alto", genre: "Vintage Pop Ballad" },
    { title: "The Summer We Were Young", titleKo: "우리가 젊었던 그 여름", story: "오랜 친구들이 수십 년 만에 바닷가 마을에 모인다. 똑같은 파도, 달라진 얼굴. 밤이 깊어지며 그들은 그 여름의 노래를 다시 부르고, 잃어버린 친구의 빈자리를 함께 채운다.", vocal: "male and female duet", genre: "Romantic Soft Rock" },
    { title: "Still Hear You Humming", titleKo: "여전히 들리는 당신의 노랫소리", story: "어머니가 부엌에서 늘 흥얼거리던 멜로디. 세월이 흘러 그 집은 사라졌지만, 비 오는 저녁이면 그 소리가 다시 들려온다. 기억은 멜로디로 남는다는 LUMEROVIA의 믿음을 담은 노래.", vocal: "tender mature male tenor", genre: "Heartfelt Korean Fusion" },
    { title: "Lanterns on the River", titleKo: "강 위의 등불", story: "젊은 연인이 강가에서 등불을 띄우며 약속을 했다. 40년 뒤, 홀로 남은 남자가 같은 강에 다시 등불을 띄운다. 불빛은 멀어지지만 약속은 아직 그 자리에 있다.", vocal: "warm mature male baritone", genre: "Epic Cinematic Rock" },
    { title: "Every Autumn Brings You Back", titleKo: "가을마다 당신이 돌아와요", story: "단풍이 물들 때마다 떠오르는 첫사랑. 그 사람은 다른 삶을 살고 있지만, 가을 숲길을 걸을 때마다 그 시절의 설렘이 되살아난다. 그리움이 아닌 감사로 끝나는 노래.", vocal: "warm mature female alto", genre: "Korean Trot Ballad Fusion" },
  ],
  love: [
    { title: "Forty Winters With You", titleKo: "당신과 함께한 마흔 번의 겨울", story: "결혼 40주년을 맞은 부부가 처음 만났던 눈 내리는 바닷가로 돌아간다. 젊음은 지났지만 손을 잡는 방식은 그대로다. 긴 세월을 함께 견딘 사랑에 대한 담담한 고백.", vocal: "warm mature male baritone", genre: "Cinematic Nostalgic Soft Rock" },
    { title: "Slow Dance in the Kitchen", titleKo: "부엌에서의 느린 춤", story: "라디오에서 옛 노래가 흘러나오자 남편이 설거지하던 아내의 손을 잡아 춤을 춘다. 화려한 무대도 꽃도 없지만, 평범한 저녁 부엌이 세상에서 가장 로맨틱한 무도회장이 된다.", vocal: "male and female duet", genre: "Vintage Pop Ballad" },
    { title: "You Were the Morning", titleKo: "당신은 아침이었어요", story: "새벽 산 정상에서 일출을 기다리는 남자. 늘 먼저 일어나 커피를 내려주던 아내를 생각한다. 그녀가 자신의 삶에 아침을 가져다준 사람이었음을 노래한다.", vocal: "tender mature male tenor", genre: "Romantic Soft Rock" },
    { title: "Hold Me Like the Tide", titleKo: "밀물처럼 나를 안아줘", story: "오랜 세월 바닷가 마을에 살아온 연인. 파도가 매일 돌아오듯 변하지 않는 사랑을 노래한다. 거센 폭풍도 지나갔고, 이제 남은 것은 서로를 안아주는 조용한 밀물 같은 사랑.", vocal: "warm mature female alto", genre: "Heartfelt Korean Fusion" },
    { title: "Under the Same Old Moon", titleKo: "같은 옛 달 아래", story: "떨어져 지내야 했던 젊은 시절, 두 사람은 같은 달을 보며 편지를 썼다. 이제 나란히 앉아 그 달을 바라보는 노부부. 긴 기다림이 완성된 사랑에 대한 노래.", vocal: "warm mature male baritone", genre: "Epic Cinematic Rock" },
    { title: "One More Spring Together", titleKo: "함께하는 또 한 번의 봄", story: "병을 이겨낸 아내와 함께 벚꽃길을 다시 걷는 남편. 매년 당연했던 봄이 얼마나 소중한 선물인지 깨달으며, 함께 맞는 또 한 번의 봄에 감사한다.", vocal: "tender mature male tenor", genre: "Korean Trot Ballad Fusion" },
  ],
  family: [
    { title: "Daddy's Old Guitar", titleKo: "아버지의 낡은 기타", story: "아버지가 떠난 뒤 다락에서 발견한 기타. 아들은 서툰 손으로 아버지가 늘 치던 코드를 짚어본다. 조율이 틀어진 기타 소리 속에서 아버지의 목소리가 다시 들려오는 이야기.", vocal: "warm mature male baritone", genre: "Cinematic Nostalgic Soft Rock" },
    { title: "Mama's Porch Light", titleKo: "어머니의 현관 불빛", story: "아무리 늦게 돌아와도 늘 켜져 있던 현관 불빛. 어머니가 떠난 지금, 중년의 딸은 자신의 아이들을 위해 같은 불빛을 켜둔다. 사랑은 그렇게 이어진다.", vocal: "warm mature female alto", genre: "Vintage Pop Ballad" },
    { title: "The House on Pine Hill", titleKo: "소나무 언덕의 집", story: "삼대가 함께 자란 언덕 위의 집이 팔리는 날. 가족이 마지막으로 모여 빈 방마다 추억을 꺼낸다. 집은 떠나도 가족은 남는다는 따뜻한 송별의 노래.", vocal: "male and female duet", genre: "Heartfelt Korean Fusion" },
    { title: "Little Hands, Long Road", titleKo: "작은 손, 긴 길", story: "처음 아이의 손을 잡고 걸었던 시골길. 이제 그 아이가 자신의 아이 손을 잡고 같은 길을 걷는다. 아버지가 된 아들을 멀리서 바라보는 할아버지의 시선.", vocal: "tender mature male tenor", genre: "Romantic Soft Rock" },
    { title: "Sunday at Grandmother's Table", titleKo: "할머니 식탁의 일요일", story: "매주 일요일 온 가족이 모이던 할머니의 식탁. 그 자리는 비었지만, 손녀가 할머니의 요리법으로 같은 음식을 만들어 식탁을 다시 채운다.", vocal: "warm mature female alto", genre: "Korean Trot Ballad Fusion" },
    { title: "Carry Me Home", titleKo: "나를 집으로 데려다줘", story: "어린 시절 잠든 자신을 등에 업고 돌아오던 아버지. 세월이 흘러 이제 아들이 노쇠한 아버지를 부축해 같은 길을 걷는다. 돌봄이 되돌아오는 인생의 순환.", vocal: "warm mature male baritone", genre: "Epic Cinematic Rock" },
  ],
  life: [
    { title: "The River Knows My Name", titleKo: "강은 내 이름을 안다", story: "평생 강가 마을에 살며 어부로 늙은 남자. 강은 그의 청춘과 실패와 사랑을 모두 지켜봤다. 인생을 돌아보며 흘러가는 강에 자신을 맡기는 담담한 노래.", vocal: "warm mature male baritone", genre: "Cinematic Nostalgic Soft Rock" },
    { title: "Grey Hair, Golden Years", titleKo: "흰 머리, 황금빛 시절", story: "거울 속 낯선 흰 머리에 놀란 여자가 사진첩을 펼친다. 젊음이 떠난 자리에 남은 것은 상처가 아니라 깊어진 사랑과 지혜라는 것을 깨닫는 이야기.", vocal: "warm mature female alto", genre: "Vintage Pop Ballad" },
    { title: "Miles I Never Counted", titleKo: "세어보지 않은 그 길들", story: "트럭 운전사로 평생을 산 남자의 은퇴 날. 수많은 길과 밤과 이별이 있었지만 세어보지 않았다. 산맥 위로 지는 노을 앞에서 그는 자신의 길에 처음으로 감사한다.", vocal: "tender mature male tenor", genre: "Epic Cinematic Rock" },
    { title: "Seasons of a Simple Man", titleKo: "소박한 한 남자의 사계", story: "봄에 심고 가을에 거두던 농부의 일생. 네 계절처럼 돌아온 삶의 기쁨과 슬픔. 다랭이 논 위로 지는 해를 보며 자신의 소박한 삶이 충분했음을 노래한다.", vocal: "warm mature male baritone", genre: "Heartfelt Korean Fusion" },
    { title: "What the Mountain Taught Me", titleKo: "산이 내게 가르쳐 준 것", story: "젊어서는 정상만 보고 올랐던 산을, 노년에는 천천히 길을 음미하며 오른다. 산은 변하지 않았지만 그가 변했다. 속도가 아니라 걸음 자체가 인생이라는 깨달음.", vocal: "warm mature male baritone", genre: "Romantic Soft Rock" },
    { title: "Time Was Kind After All", titleKo: "결국 시간은 다정했다", story: "상실과 후회로 가득했다고 믿었던 삶을 되돌아보니, 그 안에 늘 사람과 사랑이 있었다. 시간이 가져간 것보다 남겨준 것이 더 많았음을 노래한다.", vocal: "warm mature female alto", genre: "Korean Trot Ballad Fusion" },
  ],
  hope: [
    { title: "Morning Over the Sea", titleKo: "바다 위의 아침", story: "큰 상실을 겪은 남자가 새벽 바닷가에서 일출을 기다린다. 어둠이 영원할 것 같았지만 해는 반드시 뜬다. 상실 뒤에도 다시 살아갈 용기를 찾는 노래.", vocal: "warm mature male baritone", genre: "Cinematic Nostalgic Soft Rock" },
    { title: "Light Will Find the Valley", titleKo: "빛은 골짜기를 찾아온다", story: "안개 낀 녹차밭 골짜기에 아침 햇살이 스며드는 풍경. 병과 외로움을 겪은 여자가 그 빛처럼 자신에게도 따뜻한 날이 찾아올 것을 믿는다.", vocal: "warm mature female alto", genre: "Epic Cinematic Rock" },
    { title: "Begin Again at Sixty", titleKo: "예순에 다시 시작하기", story: "은퇴 후 평생 미뤄둔 꿈에 도전하는 남자. 늦었다고 말하는 세상에 조용히 '아직 아침'이라고 답한다. 나이와 상관없이 다시 시작할 수 있다는 희망.", vocal: "tender mature male tenor", genre: "Romantic Soft Rock" },
    { title: "Blossoms After the Storm", titleKo: "폭풍 뒤의 꽃", story: "거센 비바람이 지난 뒤에도 벚꽃길은 다시 피어난다. 인생의 폭풍을 지나온 부부가 꽃길을 걸으며 남은 날들에 대한 희망을 나눈다.", vocal: "male and female duet", genre: "Vintage Pop Ballad" },
    { title: "Tomorrow Has Your Smile", titleKo: "내일엔 당신의 미소가", story: "손주의 웃음 속에서 떠난 아내의 미소를 발견한 할아버지. 상실이 끝이 아니라 이어짐임을 깨닫고, 내일을 향해 다시 웃는 이야기.", vocal: "warm mature male baritone", genre: "Heartfelt Korean Fusion" },
    { title: "The Sun Still Climbs the Hill", titleKo: "해는 여전히 언덕을 오른다", story: "매일 같은 언덕을 오르는 노인. 무릎은 아프고 숨은 가쁘지만 해도 매일 그 언덕을 오른다. 작은 일상의 반복 속에서 발견하는 묵묵한 희망.", vocal: "warm mature male baritone", genre: "Korean Trot Ballad Fusion" },
  ],
  farewell: [
    { title: "I Left the Light On", titleKo: "불을 켜두었어요", story: "떠난 사람을 위해 매일 밤 창가의 불을 켜두는 여자. 돌아오지 않을 것을 알면서도 끌 수 없는 불빛. 이별이 끝나지 않은 사랑에 대한 애절한 노래.", vocal: "warm mature female alto", genre: "Korean Trot Ballad Fusion" },
    { title: "The Last Train to Gangneung", titleKo: "강릉행 마지막 열차", story: "젊은 시절 바닷가 역에서 헤어진 두 사람. 그는 마지막 열차에 올랐고 다시 돌아오지 못했다. 늙은 남자가 그 역에 홀로 서서 그날의 이별을 떠올린다.", vocal: "warm mature male baritone", genre: "Cinematic Nostalgic Soft Rock" },
    { title: "Where the Reeds Remember", titleKo: "갈대가 기억하는 곳", story: "함께 걷던 노을 진 갈대밭을 홀로 걷는 남자. 바람에 흔들리는 갈대 소리가 떠난 아내의 목소리처럼 들린다. 슬픔이 그리움으로, 그리움이 감사로 변하는 과정.", vocal: "tender mature male tenor", genre: "Heartfelt Korean Fusion" },
    { title: "Goodbye Was Never Said", titleKo: "작별 인사는 없었어요", story: "갑작스러운 이별로 마지막 인사를 하지 못한 사람에게 보내는 노래. 수십 년이 지나 산 정상에서 하늘을 향해 비로소 '안녕'을 말한다.", vocal: "warm mature male baritone", genre: "Epic Cinematic Rock" },
    { title: "Empty Chair by the Window", titleKo: "창가의 빈 의자", story: "매일 아침 함께 커피를 마시던 창가 의자가 비었다. 남은 사람은 여전히 두 잔을 내린다. 일상 속에 남은 부재의 무게를 담담하게 그린 노래.", vocal: "warm mature female alto", genre: "Vintage Pop Ballad" },
    { title: "Snow on Your Side of the Bed", titleKo: "당신 자리에 내리는 눈", story: "아내가 떠난 첫 겨울, 창밖에 눈이 내린다. 그녀가 사랑했던 눈을 혼자 바라보는 남자. 슬픔 속에서도 그녀가 남긴 따뜻함을 기억하는 노래.", vocal: "warm mature male baritone", genre: "Romantic Soft Rock" },
  ],
  gratitude: [
    { title: "Thank You for the Years", titleKo: "그 세월에 감사해요", story: "오랜 세월 묵묵히 곁을 지켜준 배우자에게 처음으로 전하는 감사. 화려한 말 대신 함께 본 수많은 저녁 노을을 떠올리며 고마움을 전한다.", vocal: "warm mature male baritone", genre: "Cinematic Nostalgic Soft Rock" },
    { title: "Grace in Ordinary Days", titleKo: "평범한 날들의 은총", story: "특별할 것 없던 하루하루가 사실은 선물이었음을 깨닫는 노년의 여자. 아침 안개, 식탁의 웃음, 저녁 산책 같은 작은 것들에 감사하는 노래.", vocal: "warm mature female alto", genre: "Vintage Pop Ballad" },
    { title: "You Stayed When Others Left", titleKo: "모두 떠날 때 당신은 남았어요", story: "인생의 가장 어두운 시기에 곁을 떠나지 않은 친구에게 바치는 노래. 수십 년이 지나 함께 산길을 오르며 그때의 고마움을 비로소 말한다.", vocal: "tender mature male tenor", genre: "Romantic Soft Rock" },
    { title: "The Gift of One More Day", titleKo: "하루를 더 선물받은 것", story: "큰 병을 이기고 맞은 첫 아침. 평범한 일출이 기적처럼 보인다. 주어진 하루하루를 선물로 받아들이는 감사의 노래.", vocal: "warm mature male baritone", genre: "Epic Cinematic Rock" },
    { title: "Hands That Held Me Up", titleKo: "나를 일으켜 준 손들", story: "부모, 스승, 친구, 배우자. 인생의 고비마다 자신을 일으켜 준 손들을 하나씩 떠올리는 남자. 그 손들에 보답하듯 이제 자신이 누군가의 손이 되기로 한다.", vocal: "male and female duet", genre: "Heartfelt Korean Fusion" },
    { title: "Blessed by the Evening Sky", titleKo: "저녁 하늘의 축복", story: "하루 일을 마치고 바라보는 노을. 특별한 성취는 없었지만 사랑하는 사람들과 무사히 하루를 보냈다는 것만으로 충분하다는 소박한 감사.", vocal: "warm mature female alto", genre: "Korean Trot Ballad Fusion" },
  ],
};

export function sampleTitles(emotion: string, count: number): TitleCandidate[] {
  const bank = TITLE_BANK[emotion] ?? TITLE_BANK.nostalgia;
  const out: TitleCandidate[] = [];
  const shuffledLand = [...LANDSCAPES].sort(() => Math.random() - 0.5);
  bank.forEach((t, i) => out.push({ id: uid("t"), landscape: shuffledLand[i % shuffledLand.length], ...t }));
  // Pad with landscape-driven variations so the list reaches the requested count
  const prefixes = ["Evening in", "Letters from", "Coming Home to", "Somewhere Near", "A Song for", "Last Light Over", "Morning Mist on", "Waiting by"];
  const subjects = ["the Old Harbor", "the Maple Hill", "the Quiet Shore", "the Reed Fields", "the Mountain Road", "the River Bend", "the Blossom Lane", "the Tea Hills"];
  const subjectsKo = ["옛 항구", "단풍 언덕", "고요한 해변", "갈대밭", "산길", "강굽이", "벚꽃길", "녹차 언덕"];
  let k = 0;
  while (out.length < count && k < 16) {
    const p = prefixes[k % prefixes.length];
    const s = subjects[(k * 3) % subjects.length];
    const sKo = subjectsKo[(k * 3) % subjectsKo.length];
    const base = bank[k % bank.length];
    out.push({
      id: uid("t"),
      title: `${p} ${s}`,
      titleKo: `${sKo}에서의 ${p.startsWith("Evening") ? "저녁" : p.startsWith("Letters") ? "편지" : p.startsWith("Coming") ? "귀향" : p.startsWith("Morning") ? "아침 안개" : p.startsWith("Last") ? "마지막 빛" : p.startsWith("Waiting") ? "기다림" : "노래"}`,
      story: `${sKo} 풍경을 배경으로 한 ${EMOTIONS.find((e) => e.key === emotion)?.ko ?? "추억"} 이야기. ${base.story.split(". ").slice(0, 2).join(". ")}. 풍경과 기억이 하나의 멜로디로 이어지는 장면으로 마무리된다.`,
      vocal: base.vocal,
      genre: k % 2 === 0 ? "Cinematic Nostalgic Soft Rock" : base.genre,
      landscape: shuffledLand[(bank.length + k) % shuffledLand.length],
    });
    k++;
  }
  return out.slice(0, count);
}

type LyricTemplate = (t: string, land: string) => string;

const LYRIC_TEMPLATES: Record<string, LyricTemplate> = {
  nostalgia: (t, land) => `[Verse 1]
The road still bends the way it did
When we were young and running wild
I counted every step we hid
Beneath ${land}

[Verse 2]
The years rolled by like evening trains
With windows full of faded light
I kept your laughter through the rains
I keep it warm tonight

[Chorus]
${t}
That's where I find you still
Every song the wind has learned
Comes back across the hill
${t}
I never lost the way
The melody of yesterday
Is calling me to stay

[Bridge]
If time could lend me one more mile
I'd walk it slow with you
And watch the autumn light awhile
The way we used to do

[Final Chorus]
${t}
That's where I find you still
Every song the wind has learned
Comes back across the hill
${t}
I'll hold it close today
The melody of yesterday
Will never fade away

[Outro]
Oh, the old road bends
And the memory stays`,

  love: (t, land) => `[Verse 1]
You poured the coffee, I held the door
Forty years of simple days
The light came softly through the floor
Like ${land}

[Verse 2]
We never needed silver rings
To prove the promise that we made
Just quiet mornings, little things
And love that never strayed

[Chorus]
${t}
Through every winter, every storm
You were the fire that kept me warm
${t}
When the night was long
You were the melody, I was the song

[Bridge]
And if my hair has turned to grey
And if my steps are slow
You're still the reason for the day
The only home I know

[Final Chorus]
${t}
Through every winter, every storm
You were the fire that kept me warm
${t}
Till the stars are gone
You'll be the melody, I'll be the song

[Outro]
Hold my hand, my love
Just like we always have`,

  family: (t, land) => `[Verse 1]
There's a light still burning on the porch
The way it did when I was small
Mama's voice would carry through the dark
Calling me home from it all

[Verse 2]
Now the house is quiet, the yard is still
The maple tree has grown so tall
I stand beneath ${land}
And I remember it all

[Chorus]
${t}
You taught me how to stand
With little hands and a long, long road
You never let go of my hand
${t}
Wherever I may be
The home you built inside my heart
Is always there for me

[Bridge]
Now my children run the same old field
And I keep the porch light on
The love you gave is the love I give
It carries on and on

[Final Chorus]
${t}
You taught me how to stand
With little hands and a long, long road
You never let go of my hand
${t}
I'll say it to the sky
The home you built inside my heart
Will never say goodbye`,

  life: (t, land) => `[Verse 1]
I used to race the morning sun
Up every hill I meant to climb
I never asked where I had run
I only chased the time

[Verse 2]
Now the river moves without a sound
Through ${land}
And every mile I've ever found
Is written in my hands

[Chorus]
${t}
The seasons taught me how to wait
How to lose and how to stay
${t}
I walked a long, long way
And every scar became a song
I'm singing here today

[Bridge]
The young man thought the top was all
The old man loves the road
The river doesn't need to run
It only needs to flow

[Final Chorus]
${t}
The seasons taught me how to wait
How to lose and how to stay
${t}
I'd walk it all again
For every tear became a song
And every song, a friend`,

  hope: (t, land) => `[Verse 1]
The night was long, the sky was grey
I thought the dark would never end
I stood alone and watched the bay
Waiting for the light again

[Verse 2]
Then slowly over the sleeping sea
A thread of gold began to rise
Like ${land}
It opened up my eyes

[Chorus]
${t}
After every falling tear
The sun will climb the hill again
And morning will be here
${t}
I'm learning how to rise
There's a new day in the water
And a new light in my eyes

[Bridge]
I'm not too old to begin again
Not too tired to try
The storm has passed, the blossoms bloom
Beneath a brighter sky

[Final Chorus]
${t}
After every falling tear
The sun will climb the hill again
And morning will be here
${t}
I'm learning how to fly
There's a new day in the water
And a new song in the sky`,

  farewell: (t, land) => `[Verse 1]
I set two cups beside the glass
The way I did for all those years
I watch the quiet morning pass
Through ${land}

[Verse 2]
The reeds still whisper by the shore
In the voice I used to know
I walk the path we walked before
A little bit more slow

[Chorus]
${t}
I never said goodbye
I left the light on in the hall
In case you're passing by
${t}
And the wind keeps calling your name
And every evening, every rain
Brings you back again

[Bridge]
They say the heart will learn to mend
They say the ache will fade
But you were more than just a friend
You were the home I made

[Final Chorus]
${t}
I'm learning to say goodbye
I'll leave the light on in the hall
Beneath the evening sky
${t}
And the wind still carries your name
But now I smile at every rain
That brings you back again

[Outro]
Goodnight, my love
Goodnight`,

  gratitude: (t, land) => `[Verse 1]
For every morning cup of tea
For every word you didn't say
For standing right there next to me
On every ordinary day

[Verse 2]
We watched the sun go down a thousand times
Across ${land}
I never thanked you for the years
I'm thanking you tonight

[Chorus]
${t}
For the hands that held me up
For the grace in simple days
For every overflowing cup
${t}
Oh, what a gift you've been
If I could live it all again
I'd choose you once again

[Bridge]
When others left, you stayed with me
You never asked for more
You were the quiet harbor light
That guided me to shore

[Final Chorus]
${t}
For the hands that held me up
For the grace in simple days
For every overflowing cup
${t}
Oh, what a gift you've been
Till the evening sky grows dim
I'll thank you once again`,
};

export function sampleLyrics(opts: { title: string; emotion: string; landscape: string }): string {
  const tpl = LYRIC_TEMPLATES[opts.emotion] ?? LYRIC_TEMPLATES.nostalgia;
  return tpl(opts.title || "Where Memories Become Melodies", landscapeEn(opts.landscape || ""));
}

const REWRITE_BANK = [
  "The evening settles soft and slow", "I hear your voice in every rain", "The years have made me gentle now", "We walked the road that time forgot",
  "Your hand was always warm in mine", "The light falls golden on the hill", "I kept the song you used to hum", "And still the river finds the sea",
  "The autumn leaves came down like rain", "I'd give the world to see you smile", "There's grace in every ordinary day", "The morning came and so did you",
  "We never needed more than this", "I carry you in every mile", "The old house hums your melody", "And every star remembers us",
  "Beneath the maple, we were young", "I'll keep the porch light burning on", "The sea rolls in the way it did", "A thousand sunsets, one more day",
];

export function sampleRewrite(selection: string): string {
  const lines = selection.replace(/\r/g, "").split("\n");
  const used = new Set<string>();
  return lines
    .map((line) => {
      if (!line.trim()) return line;
      if (/^\s*\[.*\]\s*$/.test(line)) return line;
      const target = analyzeLyrics(line).lines.find((l) => !l.isBlank)?.syllables ?? 8;
      let best = REWRITE_BANK[0];
      let bestDiff = Infinity;
      for (const cand of REWRITE_BANK) {
        if (used.has(cand)) continue;
        const syl = cand.split(/\s+/).reduce((s, w) => s + countSyllables(w), 0);
        const d = Math.abs(syl - target);
        if (d < bestDiff) {
          bestDiff = d;
          best = cand;
        }
      }
      used.add(best);
      return best;
    })
    .join("\n");
}

export function sampleStyleRefine(options: StyleOption[]): StyleOption[] {
  return options;
}

export function sampleVideoConcept(opts: { title: string; story: string; landscape: string; lyrics: string }): string {
  const sections = analyzeLyrics(opts.lyrics).structure;
  const land = opts.landscape || "담양 메타세쿼이아길 가을";
  const alt = LANDSCAPES.filter((l) => l !== land).slice(0, 4);
  const sceneLines = sections.length
    ? sections.map((s, i) => `- ${s}: ${i === 0 ? land : alt[i % alt.length]} / ${i % 2 === 0 ? "느린 드론 전진 샷" : "삼각대 고정, 바람에 흔들리는 피사체 클로즈업"} / ${i === sections.length - 1 ? "노을이 사라지며 페이드아웃" : "따뜻한 역광, 길게 유지"}`)
    : [`- 전체: ${land} / 느린 드론 샷`];
  return `1) 전체 콘셉트
"${opts.title}"는 ${opts.story.slice(0, 60)}… 이야기를 담은 곡입니다. 영상은 ${land}을(를) 중심으로 인물 없이 풍경과 빛의 변화만으로 감정을 전달합니다. 과거의 기억을 떠올리는 듯한 느린 카메라 움직임과 긴 호흡의 컷을 유지하고, 후렴에서 가장 넓은 풍경을 보여 감정을 고조시킵니다.

2) 색감·톤
따뜻한 앰버·골드 톤의 필름 룩, 대비는 낮고 그레인은 살짝. 시간대는 해 뜨기 직전과 노을 직후를 중심으로 하며, 날씨는 맑거나 얇은 안개가 있는 날을 권장합니다.

3) 섹션별 장면
${sceneLines.join("\n")}

4) 썸네일 아이디어
- ${land} 넓은 풍경 위에 세리프 영문 제목 "${opts.title}"을 아이보리 색으로, 하단에 작게 "LUMEROVIA".
- 역광의 나무 한 그루 또는 빈 벤치 실루엣, 골드 톤 자막으로 제목.

5) 영상 설명란 영어 문구
"${opts.title}" — a song for everyone who still hears an old melody when the light turns gold. Filmed across the quiet landscapes of Korea. Where Memories Become Melodies.`;
}
