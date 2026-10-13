// Firebase keys for arcade accounts (sign up / log in, likes).
// Leave apiKey empty and the arcade works as before, just without accounts.
//
// To fill this in: Firebase console > Project settings (gear icon) > General > Your apps > your web app >
// "SDK setup and configuration" > Config. Copy the values between the quotes below.
// These keys are safe to publish: the Firestore rules in tools/firestore.rules are what protect the data.

const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};
