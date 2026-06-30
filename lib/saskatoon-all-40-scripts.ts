export type SaskatoonScriptStop = {
  index: number;
  id: string;
  title: string;
  script: string;
  safetyNote: string;
  ritualCue?: string;
};

export const saskatoonAll40Stops: SaskatoonScriptStop[] = [
  {
    index: 1,
    id: "agra-road",
    title: "Agra Road (Township Rd 372)",
    ritualCue: "Windows down. Engine off. Say nothing. Listen for the voice.",
    safetyNote: "Stay in the car. Park lawfully on the shoulder and keep your doors locked.",
    script: `This is where the city gives up and the dark fields take over. Agra Road. A man was found out here once, in the ditch, on the cold edge of town. The case went cold with him. No name was ever made public. No reason was ever given.

But the road kept him.

People who park along here, late, with the engine off, say the first thing they feel is a hand. Fingers closing around an ankle, around a leg, low in the dark by the floor of the car. They look down. There is nothing there. There is never anything there.

And if you sit long enough, windows down, saying nothing, you may hear the rest of him. A man's voice, somewhere out in the black, calling the same two words over and over. Help me. Help me.`
  },
  {
    index: 2,
    id: "archaeology-building",
    title: "Archaeology Building, U of S",
    ritualCue: "Flash your headlights at the basement windows. Then watch.",
    safetyNote: "View from the road. Do not enter the building or grounds after hours.",
    script: `This building has handled the dead before. It served as a morgue, and as a forensics lab, where bodies the city could not explain were brought to be read like documents.

One of them was a woman pulled from beneath the streets of this city, preserved far better than she had any right to be after so long in the ground. Her remains were studied inside these walls. And ever since, students working late swear the basement does not stay still. Lights come on in empty rooms. Lights go off. Something down there is still keeping hours.

So try it. As you roll past on Campus Drive, flash your headlights toward the basement windows. Once. Then watch.

Because more than one person has told us the same thing. You flash the building. And the building flashes back.`
  },
  {
    index: 3,
    id: "central-avenue-circle-k-alley",
    title: "Back Alley Behind the Circle K, Central Avenue",
    safetyNote: "Stay in the car. Park lawfully and do not block the alley.",
    script: `There is a woman buried in the history of this corner, and she has never been content to stay there.

Long ago, when this was a different city, a woman was killed and hidden, sealed away below ground where no one was meant to find her. The water and the years preserved her. When she was finally uncovered, she came up wearing the fashion of a century gone by.

Pull into the back alley behind the store. Park, and wait.

People here have watched a dark figure of a woman in a long dress walk the length of this alley and then simply stop existing. Others have seen her at the corner, in old Edwardian black, waiting to cross. Stop to let her pass, look a moment too long, and she is gone.

And the light at the back of the building. Watch it. It tends to start flickering the moment you arrive, and stop the moment you leave.`
  },
  {
    index: 4,
    id: "bugsys-bar-and-grill",
    title: "Bugsy's Bar and Grill, Lawson Heights",
    safetyNote: "View from a legal public stopping point. Do not block traffic.",
    script: `Not every haunting waits politely in a cemetery. Some of them reach out and grab.

On the patio of this place, on an ordinary night, a man was sitting outside when something he could not see came for him. Witnesses say a bag was pulled over his head from behind, drawn tight, as if something invisible was trying to take the air right out of him. There was no one there to do it. The security camera caught the whole thing, and the whole nothing standing behind him.

So keep an eye on that patio as you pass. It looks like any other patio. That is exactly what makes it worse.

Whatever was out here that night was strong enough to touch the living. And nobody ever saw it leave.`
  },
  {
    index: 5,
    id: "laurier-drive-bus-stop",
    title: "Bus Stop, 3100 Block of Laurier Drive",
    safetyNote: "This can be an unsafe area. Stay in the vehicle and park in the lot across the road.",
    script: `This is one of the quiet ones. The kind that does not jump at you. The kind that just makes you sad and you do not know why.

A young woman lost her life at this bus stop, late, in the empty hours when the streets here belong to no one. The details are not ours to repeat. What lingers is the feeling.

Pull into the lot across the way and look back at the stop. People who stand here at night describe it the same way. A heaviness. A grief that is not theirs settling onto their shoulders. And on the quietest nights, when there is no traffic and no wind, the faint sound of a woman crying, somewhere very close.

Some places are haunted by what they show you. This one is haunted by what it makes you feel.`
  },
  {
    index: 6,
    id: "college-park-school",
    title: "College Park School",
    ritualCue: "Throw the soap into the yard. Then watch, and listen.",
    safetyNote: "Stay in the car. Visit only at night, park lawfully, and do not enter school grounds.",
    script: `Schools are loud places. Until they are empty. Then they remember.

The legend here is an old one, and a sad one. A girl, ten years old, is said to have died inside this school decades ago, in an accident no child should ever meet. They say she is still here after dark, and they say she answers a very particular call.

The story goes that she could not stand soap. So when you come at night, with the yard empty and the windows black, you throw a single bar of soap from your car out onto the school grounds.

And then you watch the yard. Because if the legend is true, she comes. A small figure, where there was no one a moment ago, and when she sees what you have done, she screams. And here is the part that keeps people awake. Only the one who threw it ever hears the scream.`
  },
  {
    index: 7,
    id: "devils-tail-crossing",
    title: "Devil's Tail Crossing",
    ritualCue: "Park safely. Step out. Look at your shadow as you cross.",
    safetyNote: "This stop requires leaving the vehicle. Park legally, watch for traffic, and stay out of the cemetery after hours.",
    script: `Most of tonight, we tell you to stay in the car. This one is the exception, and it is worth it.

You are at a three-way crossing, right in front of the old pioneer cemetery, on ground that has been a boundary between the living and the buried for longer than this city has had a name. Find a safe and lawful place to park. Then step out, and stand on the corner under the light.

Now look down at your own shadow.

And keep looking as you cross toward the cemetery.

Because the shadow you cast here is not quite the shadow you brought with you. People see it every time. A tail, dark and unmistakable, trailing from between the legs of their own silhouette and tapering to a sharp point on the pavement.

It works on everyone. Show your friends. Just do not think too hard about what is loaning you the extra shape.`
  },
  {
    index: 8,
    id: "ea-davies-building",
    title: "E.A. Davies Building (Old Normal School)",
    ritualCue: "Play classical music toward the building. Then cut it silent and listen.",
    safetyNote: "View from the road. Do not enter the campus or building after hours.",
    script: `For decades, this building trained the people who would teach this province's children. It has been letting something else in after hours for just as long.

An instructor here once arrived to find books left sitting outside his door, every morning, by hands no one could account for. He asked everyone. No one had touched them. One morning he came in before anyone else, opened up, and heard a woman's voice already inside, calmly making plans on his telephone. Then music. Old classical music, filling an office where he stood completely alone.

So here is yours. Roll your windows down. Play classical music through the car, let it drift toward the building, and then cut it dead.

And in the silence after, listen. People swear that when their own music stops, the school keeps playing. Faint, old, and echoing back off the stone.`
  },
  {
    index: 9,
    id: "evergreen-east",
    title: "Evergreen East (The Field off Marlatte Crescent)",
    safetyNote: "View from a legal public stopping point. Respect the neighbouring homes.",
    script: `Some hauntings are loud. This one is patient, and it only happens at the edge of the light.

Across from the homes here is a field. Flat, open, nothing to it. No hills, no trees, nowhere for a person to hide. And yet the people who live alongside it keep seeing the same impossible thing, always at dusk, in that thin grey minute when the day has not quite let go.

Two figures, out in the field, walking.

You watch them for a moment. You glance away. You look back. And the field is empty. Look again, and they are there. Gone. There. Two people the open ground should never be able to hide, blinking in and out of the world like a signal that will not hold.

Catch this place at dusk. And do not trust the field to stay empty just because it looks it.`
  },
  {
    index: 10,
    id: "factoria-ruins",
    title: "Factoria Ruins, Meewasin Trail",
    safetyNote: "View from the trail or road. Stay off the unguarded riverbank, especially after dark.",
    script: `There was almost another city here. It failed, and the river took most of what was left. But not everything down here forgot it.

Among the first to settle this stretch was a horse dealer, an old hand with animals, who bought up land along the water more than a century ago. The trail you are looking at now runs right past the last stones of the place he knew.

Walk or drive this stretch at dusk and you may meet him still working it. The witnesses describe a silhouette ahead of them on the Meewasin Trail. A man on horseback, coming toward them at an easy pace, unhurried, like he has all the time in the world.

And just before they get close enough to make out a face, horse and rider thin into the gloom and are gone, leaving the trail empty and the air a little colder than it was.`
  },
  {
    index: 11,
    id: "hodgson-road",
    title: "Hodgson Road",
    ritualCue: "Pull over. Engine off. Wait for the knocking. Do not open the door.",
    safetyNote: "Stay in the car with the doors locked. Park safely on the shoulder.",
    script: `Of every road on this map, this is the one we warn you about. If anywhere out here is going to push back, it is here. Take it seriously.

The legend of Hodgson Road is born from a darkness that visited this stretch long ago. A killing, sudden and senseless, the kind that leaves a stain on a place that no amount of time scrubs out. We will not lay out what happened. The road remembers it well enough for both of us.

Pull over where it is safe. Kill the engine. And wait.

Because the people who do say they are not alone for long. First the feeling. Then the sound. A slow knocking on the glass, deliberate, working its way around the car. The handle of a door beginning to lift. Something out there in the dark, trying to find a way in.

Do not open the door. Whatever is knocking was not invited.`
  },
  {
    index: 12,
    id: "james-anderson",
    title: "James Anderson Park",
    ritualCue: "Play the children laughing. Then watch the treeline.",
    safetyNote: "Stay in the car and use legal parking only.",
    script: `James Anderson Park is too still at night. The swings hang like they are waiting for permission to move.

There was a man who lived back in the treeline here, years ago. No house. No name anyone bothered to learn. By day this field filled up with kids, and the sound of them carried all the way to the trees, and that sound was the one thing that pulled him to the edge of the dark to listen. He never came closer than that. He just stood at the treeline, and he listened.

One night a group of older kids found him out here and decided he did not belong. The story says he never got up off the grass they left him on. The field went quiet. And he never really left it.

They say he still answers the sound he loved. So give it to him. Play a recording of children laughing and playing, turn it up until it carries across the field, and watch the inside of the treeline.

Scan slow. An old man. Long grey beard. An old ball cap. Standing just inside the trees, watching the field. Watching you. And by the time you find him, he will already have found you.`
  },
  {
    index: 13,
    id: "john-mitchell-building",
    title: "John Mitchell Building, U of S",
    ritualCue: "Leave an offering of marshmallows for Hank.",
    safetyNote: "View from the road. Do not enter campus buildings after hours.",
    script: `Theatres are full of ghosts everywhere in the world. This one has a name.

The drama department here is said to be home to a young man who died long ago, a student who never finished his final act. They call him Hank. He has been seen by full audiences in the middle of a performance, up in the rafters, moving among the lights and the sets like he still has a part to play.

The people who work here have made their peace with him. Before every opening night, the cast and crew leave him an offering so the show will go well. Marshmallows. Set out for a dead man, so a dead man does not interfere.

At dawn, security and passersby have seen another figure too, out on the grass beside the building, dancing. Twirling alone in the half-light, for an audience that is not there.

Leave Hank something sweet. It cannot hurt.`
  },
  {
    index: 14,
    id: "leisureland",
    title: "Leisureland (Maple Grove)",
    safetyNote: "Do not pass the No Trespassing or No Public Access signs. View from the lawful public road only.",
    script: `This is one of the strangest corners of the whole city, and one of the saddest.

Once, this was an amusement park. A ferris wheel turned here. There were trampolines, a little train, the sound of a midway carrying out over the river valley. Then it closed, and the rides were left to rust, and the bright place rotted slowly into a quiet backwoods trailer park hidden in the trees.

People who came out here over the years tell uneasy stories. Of being watched. Of being chased back to their cars by figures they could not quite see. Of a feeling that this hollow is guarded by something that does not want the curious anywhere near it.

You are going to reach a point where the signs turn hard. No Trespassing. No Public Access. That is your line, and you do not cross it. The Meewasin authority warns that vehicles down here between sunset and sunrise will be towed.

View it from where the law allows. The dread carries fine from there.`
  },
  {
    index: 15,
    id: "lester-b-pearson-school",
    title: "Lester B. Pearson School",
    ritualCue: "Sit alone beneath the tree for two minutes. If you dare.",
    safetyNote: "Visit at night, park lawfully, and do not enter school grounds. The tree ritual is folklore only.",
    script: `This school has landed on more than one list of the most haunted places in the country. It earns it two different ways.

The first is grief. The story goes that a young boy was struck and killed out front, long ago, on an icy winter day, in the place where children were supposed to be safe. Some sorrows soak into the ground and never dry.

The second is stranger. There is a tree in front of the school, and the legend gives it a power. They say if you sit alone beneath it, by yourself, for two full minutes, you will find you cannot move. Held in place. Paralyzed, for just long enough to be sure it is real, by whatever lives in the roots of that tree.

You do not have to test it. But you are going to want to look at that tree a while, and wonder.`
  },
  {
    index: 16,
    id: "mark-thompson-park",
    title: "Mark Thompson Park (Stonebridge)",
    safetyNote: "View from the road. Respect the park, the trees, and any resting grounds within them.",
    script: `The ground under this park is older than the city by a long way, and it has carried hard journeys across it.

This is one of the last surviving traces of an old trail, a route first walked by the First Nations and Metis peoples of this land, and later by the settlers who followed it here. People who know this place say there are graves out in these trees that were never marked, resting places the maps forgot.

There was a house on the land next door, a place with a bad name, large and abandoned and wrong. It has been torn down now. But tearing down a building does not always end what lived in it.

Drive the edge of the forested park slowly. The activity did not leave with the house. It moved into the trees, and into the quiet buildings that stand where the old place used to be.

Walk softly here, even from the car. You are a guest on ground that was spoken for long before you arrived.`
  },
  {
    index: 17,
    id: "marr-residence",
    title: "Marr Residence (Nutana)",
    safetyNote: "View from the sidewalk or road. Do not enter the property or grounds.",
    script: `This is the oldest house in the city still standing where it was built, and it has been standing long enough to have seen war.

During the Riel Resistance, this home was pressed into service as a field hospital. The wounded were carried through these doors. Some of them did not walk back out. A house remembers that kind of work.

They say two spirits hold the place now. One is a man, and he is not kind. He is heard raising his voice at women who pass through the residence, angry at something across more than a century. The other is gentler and far stranger. A light that drifts through the rooms, and inside the light, the face of a child.

Sit out front in the dark and watch the windows. People driving and walking past have seen them. Figures moving room to room, at hours when the house should be empty and still.`
  },
  {
    index: 18,
    id: "mcnab-park",
    title: "McNab Park",
    safetyNote: "View from the road. Do not enter boarded or abandoned structures.",
    script: `There is a ghost town inside this city, and most people who live here have never seen it.

McNab Park is a neighbourhood the city moved on from. Streets that still run, houses that still stand, but emptied out, boarded up, left to the weeds and to the quiet. A few people linger at the edges. And in the dark hollow houses, it is hard to say who, or what, has taken up residence.

Drive through slow. It will not feel like the city you came from. It feels like one of those abandoned prairie towns out past the highway, the kind you are not supposed to find sitting in the middle of a living city.

Most of the worst houses are gone now, finally pulled down. But the energy of the place did not go anywhere. Roll through these streets after dark and you will understand the moment the air changes. Some places stay haunted long after there is nothing left to haunt.`
  },
  {
    index: 19,
    id: "nutana-pioneer-cemetery",
    title: "Nutana Pioneer Cemetery",
    safetyNote: "Stay in the car. Park lawfully and respect cemetery hours. Keep well back from the riverbank.",
    script: `This cemetery sits on the edge of the river, and the river has never fully respected the dead.

The bank here erodes. The ground shifts. And more than once over the years, that shifting earth has given way and pulled graves down toward the water. People in this city still remember the worst of it, the year the bank collapsed and the oldest coffins slid into the river and were carried off downstream in plain daylight.

Think about that as you sit here. The disturbed ground. The resting places torn open and floated away. The spirits given every reason in the world to be restless.

And restless they are. People report the shapes of pioneers moving among the old stones in the dark, the founders of this place, still walking the ground that keeps trying to slide out from under them. And underneath it all, faint and wrong in a graveyard, the thin cries of babies.`
  },
  {
    index: 20,
    id: "nutana-school",
    title: "Nutana School",
    safetyNote: "View from the road at night. Do not enter school grounds.",
    script: `Some hauntings are accidents. This one, the legend says, was an invitation.

The story goes that a group of students here, furious at a teacher, decided to do more than complain. They worked a ritual in these halls, something they had no business attempting, meant to call up a thing that would torment the man who had wronged them.

It worked better than they could have wanted. The teacher, the story says, soon left the school for reasons he would not explain, gone from this place in a hurry.

But the thing they called did not leave with him.

That is the trouble with opening a door like that. The one who knocks does not always have to leave when you are finished with it. They say it is still in there, drifting the halls and the empty classrooms, no longer hunting one man. Just hunting. Looking for whoever is foolish enough to come close after dark.

Stay in the car. You did not summon it. Do not introduce yourself.`
  },
  {
    index: 21,
    id: "old-nunnery-bloody-mary-house",
    title: "The Old Nunnery, The Bloody Mary House",
    safetyNote: "No confirmed location. This file is informational. If you have details, submit them through the app.",
    script: `This is the file we cannot finish.

Somewhere near the edge of this city stood an old orphanage, a place the locals stopped saying the real name of a long time ago. They gave it another one instead. The Bloody Mary House.

We know the stories. We have heard them from more than one person, the same shape every time, the kind of place children were sent to and a darkness that outlasted all of them. What we do not have is the one thing this tour is built on. We cannot pin it to the map. The exact location has slipped out of the record, or been deliberately lost.

So consider this a sealed file, and an open one. If you know where it stood, if you have the coordinates, the city wants its record back.

Until then, it stays out there in the dark, unmarked, waiting to be found.`
  },
  {
    index: 22,
    id: "confed-crawler",
    title: "The Confed Crawler (Petland, Confederation Mall)",
    ritualCue: "Park behind the building. Watch the ground for movement.",
    safetyNote: "Stay in the car. Park lawfully in the lot and do not block access.",
    script: `Long before this was a pet store, it was a grocery, and the back of a grocery is a dangerous place to work alone at night.

The story here is a death on a night shift. A worker, by himself in the dark hours, caught in the machinery at the back of the building, in an accident that did not let go. The morning crew found what was left. The business pulled up and moved on not long after. The spirit did not get that option.

Pull around behind the building and sit a moment. Staff and customers have reported the activity for years, out here and inside, an unquiet presence that never clocked out.

And watch the ground. Because the thing people see most often is low. A shape that appears to be hurt, dragging itself along the floor and the pavement, still trying to crawl its way out of a shift that ended decades ago.`
  },
  {
    index: 23,
    id: "pierre-radisson-park",
    title: "Pierre Radisson Park",
    safetyNote: "View from the road or a lawful stopping point. Respect the neighbouring homes.",
    script: `This one comes from two children, a long time ago, and they never stopped being sure of what they saw.

A brother and sister used to walk home past this park, and twice in the same month they met a nun on the path. An older woman in the full traditional habit of an age already gone, hands clasped, the cloth of her habit moving as if a wind were pulling at it. But there was no wind. It was a still, hot, ordinary prairie day, and the air was dead calm.

They were polite children. They spoke to her. She did not so much as look at them.

And as she passed, they both saw the same impossible thing, and looked at each other to be sure. She had no feet. She was gliding, six full inches above the ground. By the time they turned back, she had vanished into the bright empty afternoon.

Other kids in the neighbourhood saw her too. Nobody ever learned her name.`
  },
  {
    index: 24,
    id: "range-road-3043",
    title: "Range Rd 3043 and Highway 5",
    ritualCue: "Rattle the chains, loud, into the dark. Then stop. And listen.",
    safetyNote: "Stay in the car or very close to it. Park safely off the gravel road. This is a remote area.",
    script: `Out here past the edge of the city, where the gravel runs straight into the dark, the land holds onto a cruelty it witnessed long ago.

A life was taken on this lonely stretch, and the manner of it was the kind that should never be spoken aloud for entertainment. We are not going to. The real horror belongs to someone, and it is not ours to perform. What we will tell you is that the road kept the echo.

Stop where it is safe. And bring something that rattles. Chain, metal, anything with a hard cold voice of its own.

Shake it, out here in the black, loud enough to carry across the empty fields.

Because the legend says the sound calls something back. People who have done it swear that out of the dark, answering their chains, came a scream. A woman's scream, raw and close, from a place where there was no woman, and no one at all.`
  },
  {
    index: 25,
    id: "forestry-farm",
    title: "Saskatoon Forestry Farm Park",
    ritualCue: "Call his name into the dark: ZEPPELIN. Then listen for the howl.",
    safetyNote: "View from a lawful stopping point. Respect park hours and wildlife.",
    script: `Not every spirit on this tour is human. This one had four legs and a name people still call out to the dark.

At the zoo within this park there lived a grey wolf named Zeppelin. After he passed, the people who came here did not stop seeing him. Visitors report a wolf at the edge of the fishing pond, drinking, or running free and easy through the fields around the water, where no wolf should be loose, where no wolf is.

This is the gentlest stop on the route, and maybe the most beautiful. Pull up near the pond after dark and roll the window down.

And then call him. Say his name into the trees. Zeppelin.

People who have done it tell us the same thing every time. From somewhere out past the water, out in the dark fields, the name comes back to them as a howl.`
  },
  {
    index: 26,
    id: "saskatoon-sanatorium-site",
    title: "Saskatoon Sanatorium Site",
    safetyNote: "View from the public road. This is a residential area now. Respect the residents and do not trespass.",
    script: `There is nothing standing here now. That is part of what makes it so heavy.

On this ground, decades ago, stood a sanatorium, a place built to hold the sick in an age when their illness had no cure and no mercy. People came here to fight for their lives, and a great many of them lost. The building was torn down at the end of the eighties. The suffering it housed did not come down with the walls.

Drive slowly through what is now an ordinary neighbourhood and try to feel the shape of what used to be here. A long, grim building full of the dying, set out at the edge of the city where the rest of the world would not have to look at it.

The ground remembers being a place people were sent to and did not come home from. You will feel it lean on the car as you pass. Some addresses are quiet because nothing happened there. This one is quiet because too much did.`
  },
  {
    index: 27,
    id: "shell-station-22nd",
    title: "Shell Station, 22nd Street",
    ritualCue: "At 10 a.m., look into your own driver's seat.",
    safetyNote: "A public gas station. Be considerate of staff and other customers. Stay in the car.",
    script: `Ordinary places can be the worst of all, because you let your guard down inside them. You have pumped gas a thousand times. So had he.

The story here is a man who lost his life in the driver's seat of a car at this station, in the daylight, in the middle of a perfectly normal morning, in a moment of violence that came out of nowhere and was gone.

That is why this stop has a time to it. The legend says he returns in the late morning, the same hour the city took him.

So if you can, come at ten in the morning. Fill the car here, like anyone would. And then look through your window, into your own driver's seat.

Because people swear that for one cold second, the seat is not empty. There is a man in it. Slumped, bleeding, looking back out at them from the exact place they are about to sit down.`
  },
  {
    index: 28,
    id: "smith-block",
    title: "Smith Block, the 1912 Building (Broadway Avenue)",
    safetyNote: "View from the road or sidewalk. Do not enter the building after hours.",
    script: `Some ghosts rattle chains. This one alphabetizes them.

This building, raised in 1912, once held the first library branch on the east side of the city. A man named James Stewart Wood served as its chief librarian, and by every account he loved the place. Loved it enough, the legend says, that he never agreed to leave it.

Park out front on Broadway and look up at the old windows. The story is a quiet one, fitting for a librarian. He lingers. He keeps his hours. People feel a presence inside, orderly and watchful, a caretaker still tending a collection that moved out long ago.

It is not a haunting that wants to frighten you. It is a haunting that wants you to be quiet, and to put things back where you found them.

But step wrong in his building after dark, and you may find out that even a gentle ghost does not care to be disturbed.`
  },
  {
    index: 29,
    id: "spadina-crescent-bridge",
    title: "Spadina Crescent Bridge",
    safetyNote: "View from a lawful stopping point. Do not climb down to the riverbank after dark.",
    script: `Some doors are opened on purpose, by people who do not understand what they are knocking on.

Underneath this bridge, on the west bank of the river, the story says a group once gathered with a spirit board and tried to talk to the other side. Down in the dark, by the water, where sound gets strange and the city feels far away, they asked something to come through.

It seems something did. And it never went back.

Pull over where you can see the bridge and the shadowed ground beneath it. People who come here describe figures in the bushes by the water. Shadow people, black and shapeless against the dark, except for the eyes. Two points of red light, low in the brush, watching the people who came to watch the bridge.

Whatever those teenagers let in down there is still holding the door they opened. And it is still looking for company.`
  },
  {
    index: 30,
    id: "spadina-soldier",
    title: "The Spadina Soldier",
    safetyNote: "View from the road. Obey all traffic laws on this active street.",
    script: `This one is short, and the witness who reported it could not explain it any more than you will be able to.

In the early morning, in full daylight, on this stretch of Spadina, a person watched a soldier walk by. Not a reenactor, not a parade. A soldier, alone, carrying a heavy machine gun, moving through an ordinary modern street at seven in the morning as if he belonged to a war that is not being fought here.

And there is a second piece. Another witness, on the same stretch in the dead of night, watched a large glowing orb, burning orange, cross right in front of their car. Left to right. Low and fast and silent. Then gone.

A soldier out of time. A light out of nowhere. Two strangers, two different hours, the same haunted run of road. Drive it slow, in either direction, and keep your eyes on the edges of the light.`
  },
  {
    index: 31,
    id: "sutherland-dog-park",
    title: "Sutherland Dog Park (Lower Trail)",
    safetyNote: "Stay in the car. Park lawfully at the trailhead.",
    script: `You will know this one by feel before you know it by sight.

The lower trail here runs through bush that grows wrong in the dark. Twisted branches, crowding close, shapes in the undergrowth that the headlights turn into faces and then take away again. By daylight it is a place people walk their dogs. By night it becomes something the body recognizes before the mind does.

Stop where you can see down into the treeline and the trail. You do not need a story for this one. The place provides its own.

Almost everyone who comes here after dark reports the same single thing. Not a figure. Not a sound. A certainty. The flat, undeniable feeling of being watched, by something with a clear view of you, from somewhere just inside those crooked trees.

The dogs feel it too. Watch how they stop wanting to go down the trail. Animals are honest about these things in a way people are not.`
  },
  {
    index: 32,
    id: "black-alley",
    title: "The Black Alley",
    ritualCue: "Park in the middle of the alley. Engine off. Wait for the footsteps.",
    safetyNote: "Stay in the car with the doors locked. Do not block the alley for residents.",
    script: `Behind these houses runs an alley the daylight barely reaches, where the trees have grown together overhead and made a tunnel of the dark.

This is The Black Alley, and the rule here, the locals will tell you, is to park in the middle. Not at either end. The middle, where you are furthest from both ways out.

Then cut the engine, and go silent, and wait for midnight.

Because that is when the footsteps start. Tiny ones. Light, quick, circling the car in the dark, padding around and around just outside the metal where you cannot see them. People have heard a low hissing too, close against the glass, and made the mistake of opening a door to find the source.

They never found it. There is never anything there. Only the footsteps, going around again, and the strong sudden sense that you have stayed in this alley one minute too long.`
  },
  {
    index: 33,
    id: "haunted-road",
    title: "The Haunted Road",
    safetyNote: "Do not pass the No Trespassing or No Public Access signs. Vehicles parked here between sunset and sunrise will be towed.",
    script: `This is the road that carries you down through the forest along the river, toward the hollow where Leisureland rots in the trees. It is one of the only true country roads inside this city, and the dark down here does not feel like city dark at all.

The legend belongs to the men who built the old power station along this route, back in the fifties. The story says the labour was brutal and the road was paid for in lives, that workers died down here in the building of it, and that they never found their way back out of these woods.

Drive it slow, down through the trees, with the river somewhere off in the black beside you. People say the dead workers still roam this stretch, seen at the edges of the headlights, standing among the trunks, watching the living pass through ground that cost them everything.

And remember where this road ends. When the signs say no further, that is where you stop. The dark past the signs is not yours to enter.`
  },
  {
    index: 34,
    id: "hose-and-hydrant",
    title: "The Hose and Hydrant Pub (Old Fire Hall)",
    safetyNote: "View from the road. Patronize the pub during business hours; do not loiter after close.",
    script: `This building has answered alarms since 1911, when it served the city as a fire hall. Something inside it is still on duty.

The staff who have worked here have a long list of encounters, and they have given the source of them a name. Boots. Because after the place is locked and emptied for the night, they hear him upstairs. Heavy footsteps, clomping back and forth across an empty floor, where there is no one left to walk.

He does more than pace. One night a glass sitting quietly on the bar is said to have launched itself twenty feet across the room and shattered at a staff member's feet, with no hand near it.

Park where you can see the upper windows, late, after closing. Because the encounter people return to most is this. The staff stepping out at three in the morning, locking up, glancing back, and seeing a light glowing in an upstairs window that should be dark, and a figure standing in it, looking down at them.`
  },
  {
    index: 35,
    id: "thorvaldson-building",
    title: "Thorvaldson Building, U of S",
    ritualCue: "Knock on the concrete block at the front steps.",
    safetyNote: "View from the road. Do not enter campus buildings after hours.",
    script: `This one is almost funny. Almost.

The building carries the name of a chemist who worked here, a man who gave his career to the study of concrete, of all things, to how it hardens and how it lasts. The legend says he loved his work so completely that he wanted to become part of it. That his dying wish was to be sealed inside the great block of concrete that stands at the front steps of the building that bears his name.

And the legend says the wish was granted.

So pull up out front and look at that block. Solid, grey, permanent, exactly as he would have wanted. A man who spent his life proving how long concrete endures, and who may be enduring inside it still, listening to a hundred years of students walk past without ever knowing he is there.

Knock on it, if you like. See if anything in the stone keeps better time than it should.`
  },
  {
    index: 36,
    id: "university-bridge",
    title: "University Bridge",
    ritualCue: "Ask him: ARE YOU TRAPPED? Then silence.",
    safetyNote: "View from a legal public stopping point. Do not block traffic.",
    script: `The University Bridge has carried this city across the river for more than a hundred years. Most people only think about the traffic on top of it. Tonight, think about what is inside it.

When they built the bridge, the work was hard and the records were thin. The legend says one of the men working the forms went into the concrete in the dark. Fell into the wet pour, and it set around him before anyone understood he was gone. No body was ever recovered. There was nowhere to look. He had already become part of the bridge.

They say he is still in there. Still aware. Still waiting for someone to finally notice him.

So here is what you do. Find the underside of the bridge, on either bank, somewhere you can stop safely and within the law. Roll one window down. And one of you call out to him, clearly. Ask him: are you trapped.

Then everyone stops talking. And you listen to what comes back off the concrete. The ones who have done this swear they got an answer. One word, in a voice that was never in the car. Yes.`
  },
  {
    index: 37,
    id: "western-development-museum",
    title: "Western Development Museum",
    safetyNote: "View from the road or lot. Visit exhibits during public hours only.",
    script: `This place is built to hold the past, and some of the past has refused to be put behind glass.

The museum is famous for it. Staff tell of a woman in red who appeared late one night, standing out on the recreated old main street inside, looking in at them from the dark where no visitor should have been. They have caught a little girl in a pinafore on video, on an empty street, with no explanation for where she came from or where she went.

And down at the museum's curatorial centre, in a vast building packed with thousands of artifacts, investigators say they met a small boy. They learned his name was Daniel. And they say Daniel was frightened, worried about someone, or something, that he could not put into words.

Drive the grounds slowly after dark. A museum collects objects. This one seems to have collected people, too, and not all of them know they are no longer alive.`
  },
  {
    index: 38,
    id: "westmount-park",
    title: "Westmount Park",
    safetyNote: "View from the road or a lawful stopping point. Respect the park and neighbours.",
    script: `Some hauntings are terrifying. Some are just lonely. This one will sit with you.

Near the playground in this quiet park, on a particular bench, people keep seeing an old man. He is not menacing. He is not strange to look at. He sits the way old men have always sat in parks, comfortable, unhurried, reading. A newspaper, sometimes, or a book, passing an evening the way he must have passed a thousand of them.

Drive up, or walk up, and approach him.

And watch him vanish. Right in front of you, the closer you come, the old man on the bench simply is not there anymore. The bench sits empty under the light, exactly as if no one had been there at all.

He always comes back. Other nights, other visitors, the same man, the same bench, the same book. Still reading. Still waiting out an evening that ended for him a very long time ago.`
  },
  {
    index: 39,
    id: "wiggins-park",
    title: "Wiggins Park",
    ritualCue: "Come at 3 a.m. Window down. Listen for the children.",
    safetyNote: "Stay in the car. Park lawfully and respect the neighbouring homes.",
    script: `The haunting here keeps a schedule, and it does not keep it for your comfort.

By day this is an ordinary little park. But people who pass it in the deep hours bring back two sounds that do not belong to an empty park in the middle of the night.

The first comes in autumn. Footsteps, walking through fallen leaves, slow and deliberate and close, when there is no one on the path to make them and no wind to move the leaves on their own.

The second is worse, because of when it comes. Three in the morning. The dead centre of the night. The sound of children. Laughing, playing, calling to each other across the grass, a whole bright afternoon of it, rising out of a park that is black and empty and locked.

Come at three, if you have the nerve. Roll the window down. And listen for the playground that fills with children in the one hour children should never be awake.`
  },
  {
    index: 40,
    id: "woodlawn",
    title: "Woodlawn Cemetery",
    safetyNote: "Stay in the car. Park lawfully and respect cemetery hours.",
    script: `Woodlawn Cemetery sits behind iron and a row of old trees that have watched this city grow up around them. Some of the people buried here came before the streets did.

Roll past slowly. Keep your hands inside the car.

They say an old woman walks the rows at night. Going somewhere. Looking for someone she never finds. People have watched her move between the headstones and then simply stop being there. On the worst nights there is more than one of them, pale shapes drifting low over the ground where the oldest graves are.

And then there is the other one. The presence. Nobody who has seen it can describe a face. They only describe the eyes. Completely black, with no light in them at all. Or worse, a dull green and red glow burning where the eyes should be, watching the road from somewhere inside the dark.

If you feel watched here, you are not imagining it. Keep your lights low. And listen for the one sound out there that does not move like wind.`
  }
];

export function saskatoonAll40AudioPath(stop: SaskatoonScriptStop) {
  return `/audio/saskatoon-all-40/${String(stop.index).padStart(2, "0")}-${stop.id}.mp3`;
}
