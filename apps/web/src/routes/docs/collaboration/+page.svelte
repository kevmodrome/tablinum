<script lang="ts">
	import CodeBlock from "$lib/components/CodeBlock.svelte";

	const createInvite = `import { encodeInvite } from "tablinum";

// Export an invite from an existing database
const invite = db.exportInvite();
const encoded = encodeInvite(invite);

// Share \`encoded\` as a URL parameter, QR code, or message`;

	const joinInvite = `import { decodeInvite, createTablinum } from "tablinum";

const invite = decodeInvite(encodedString);

const db = yield* createTablinum({
  schema,
  relays: invite.relays,
  epochKeys: invite.epochKeys,
  dbName: invite.dbName,
});`;

	const memberOps = `// Add a member by their Nostr public key
yield* db.addMember(pubkey);

// Remove a member (triggers key rotation)
yield* db.removeMember(pubkey);

// List all members
const members = yield* db.getMembers();
// [{ id, name?, picture?, about?, nip05?, addedAt, addedInEpoch, removedAt?, removedInEpoch? }, ...]`;

	const exportKeyExample = `// Export the current epoch key as a hex string
const key = db.exportKey();`;

	const membersCollection = `// The members property is a full collection handle
// You can query and watch it like any other collection
const allMembers = yield* db.members
  .where("addedAt").above(0)
  .and(m => !m.removedAt)
  .get();`;

	const onMembersChangedExample = `const db = yield* createTablinum({
  schema,
  relays: ["wss://relay.example.com"],
  onMembersChanged: () => {
    console.log("Members list updated");
  },
});`;

	const profileOps = `// Get your profile
const profile = yield* db.getProfile();

// Set your display identity
yield* db.setProfile({
  name: "Alice",
  picture: "https://example.com/avatar.jpg",
  about: "Building cool stuff",
});

// Your Nostr public key (share this so others can add you)
console.log(db.publicKey);`;
</script>

<svelte:head>
	<title>Identity & Collaboration — Tablinum</title>
</svelte:head>

<h1>Identity & Collaboration</h1>

<p>
	Tablinum has a built-in system for sharing a database with other people and revoking access
	when needed. No separate auth server or user management required.
</p>

<h2>How It Works</h2>

<p>
	Every Tablinum database has a shared secret key called an <strong>epoch key</strong>. Members
	who have the key can read and write data. When someone is removed, a new epoch key is generated
	and distributed to the remaining members — the removed person keeps their old key (and can still
	read old data) but cannot decrypt anything new.
</p>

<p>
	Think of it like changing the locks when a roommate moves out.
</p>

<h2>Creating Invites</h2>

<p>
	Generate a shareable invite string that contains everything needed to join:
</p>

<CodeBlock code={createInvite} lang="typescript" />

<p>
	The invite contains the epoch keys, relay URLs, and database name. Share it however you like —
	as a URL parameter, QR code, or direct message.
</p>

<h2>Joining via Invite</h2>

<p>
	Decode the invite and pass its contents to <code>createTablinum</code>:
</p>

<CodeBlock code={joinInvite} lang="typescript" />

<h2>Managing Members</h2>

<CodeBlock code={memberOps} lang="typescript" />

<p>
	Each <code>MemberRecord</code> includes:
</p>

<ul>
	<li><code>id</code> — the member's Nostr public key</li>
	<li><code>name</code>, <code>picture</code>, <code>about</code>, <code>nip05</code> — optional profile fields</li>
	<li><code>addedAt</code> — when they were added</li>
	<li><code>addedInEpoch</code> — the epoch ID active when they were added</li>
	<li><code>removedAt</code> — when they were removed (if applicable)</li>
	<li><code>removedInEpoch</code> — the epoch ID active when they were removed (if applicable)</li>
</ul>

<h2>Key Rotation</h2>

<p>
	When you call <code>db.removeMember(pubkey)</code>, Tablinum automatically:
</p>

<ol>
	<li>Generates a new epoch key</li>
	<li>Distributes it to all remaining members via encrypted messages</li>
	<li>Starts encrypting new data with the new key</li>
</ol>

<p>
	The removed member retains their copy of the old key, so they can still read historical data
	from before the rotation. But all new writes are encrypted with the new key, which they don't have.
</p>

<h2>Exporting Keys</h2>

<p>
	Export the current epoch key for backup or manual sharing:
</p>

<CodeBlock code={exportKeyExample} lang="typescript" />

<h2>Members Collection</h2>

<p>
	The <code>db.members</code> property exposes the internal members collection as a full
	<code>CollectionHandle</code> (or <code>Collection</code> in Svelte). You can query and watch it
	like any other collection:
</p>

<CodeBlock code={membersCollection} lang="typescript" />

<h2>Profiles</h2>

<p>
	Set your display identity so collaborators can see who you are:
</p>

<CodeBlock code={profileOps} lang="typescript" />

<h2>Members Changed Callback</h2>

<p>
	Use <code>onMembersChanged</code> to react when the members list is updated (e.g., a new member joins or is removed):
</p>

<CodeBlock code={onMembersChangedExample} lang="typescript" />

<h2>Removal Notification</h2>

<p>
	If the local user is removed from a group, the <code>onRemoved</code> callback fires:
</p>

<CodeBlock
	code={`const db = yield* createTablinum({
  schema,
  relays: ["wss://relay.example.com"],
  onRemoved: () => {
    console.log("You have been removed from this group");
  },
});`}
	lang="typescript"
/>
