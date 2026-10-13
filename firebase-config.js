// Firebase keys for arcade accounts (sign up / log in, likes).
// Leave apiKey empty and the arcade works as before, just without accounts.
//
// Where these come from: Firebase console > Project settings (gear icon) > General > Your apps > your web app >
// "SDK setup and configuration" > Config.
// These keys are safe to publish: the Firestore rules in tools/firestore.rules are what protect the data.

const firebaseConfig = {
  apiKey: "AIzaSyCrsOhhEMMbg-F7ZEJwEEQXoj_lF0yfndQ",
  authDomain: "ccstudios-arcade.firebaseapp.com",
  projectId: "ccstudios-arcade",
  storageBucket: "ccstudios-arcade.firebasestorage.app",
  messagingSenderId: "300192757922",
  appId: "1:300192757922:web:649fd5685acfa52f623ffb"
};
