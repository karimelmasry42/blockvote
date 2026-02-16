<<<<<<< HEAD
# 🗳️ BlockVote  
### Secure Voting and Identity Management System using Blockchain & AI  

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
![Status](https://img.shields.io/badge/Status-In%20Development-blue)
![Platform](https://img.shields.io/badge/Platform-Web%20%26%20Mobile-orange)
![Tech Stack](https://img.shields.io/badge/Tech-Blockchain%20%7C%20AI%20%7C%20Cybersecurity-lightgrey)

---

## 📘 Project Overview  

**BlockVote** is a hybrid **web and mobile platform** designed to provide **secure, transparent, and tamper-resistant digital voting**.  
The system leverages **blockchain** for immutable record-keeping, **cryptography** for voter anonymity and authentication,  
and **artificial intelligence (AI)** for detecting fraudulent or abnormal voting behavior.  

Developed as part of the **AASTMT College of Computing and Information Technology – Cybersecurity Graduation Project (2025–2026)**,  
BlockVote demonstrates how decentralized technologies can ensure **trust**, **integrity**, and **verifiability** in modern digital elections.  

---

## 🎯 Objectives  

- Guarantee **data integrity** and prevent vote tampering through blockchain immutability.  
- Provide **secure digital identity management** using cryptographic verification.  
- Deliver a **hybrid architecture** accessible via web and mobile clients.  
- Integrate **AI-based fraud detection** to monitor anomalies and suspicious voting patterns.  

---

## 🧠 Key Features  

✅ Blockchain-based decentralized voting ledger  
✅ Secure voter identity verification with cryptographic keys  
✅ Web (React) and Mobile (Flutter) hybrid system  
✅ Backend APIs secured with JWT and encryption  
✅ AI fraud detection using machine learning models  
✅ Tamper-proof and transparent result auditing  
✅ Admin dashboard for real-time monitoring  

---

## 🧩 System Architecture  

> ⚠️ Implementation in progress — this section will be updated as modules are developed.  

## 🧪 Technology Stack  

> ⚠️ Implementation in progress — this section will be updated as modules are developed.  

| Layer | Technologies |
|-------|--------------|
| **Frontend (Web)** | React, TailwindCSS |
| **Frontend (Mobile)** | Flutter |
| **Backend** | Node.js / Flask |
| **Blockchain** | Ethereum / Polygon (Solidity Smart Contracts) |
| **Database** | MongoDB / IPFS |
| **AI Layer** | Python, TensorFlow, Scikit-learn |
| **Security** | AES, RSA, SHA-256, JWT |
| **Tools** | MetaMask, Ganache, Hardhat, Postman |

---

## 🧑‍💻 Team Members  

| Name | Role | Responsibilities |
|------|------|------------------|
| [![Yousef Kamal](https://img.shields.io/badge/Yousef%20Kamal-100000?style=flat&logo=github&logoColor=white)](https://github.com/YxFarghaly) | Backend Developer | RESTful API development, secure data flow, integration |
| [![Felopater Osama](https://img.shields.io/badge/Felopater%20Osama-100000?style=flat&logo=github&logoColor=white)](#) | Backend Developer | RESTful API development, secure data flow, integration |
| [![Amer Ashoush](https://img.shields.io/badge/Amer%20Ashoush-100000?style=flat&logo=github&logoColor=white)](https://github.com/Mororock6) |  Web Developer | Admin dashboard UI and web integration | | 
AI Engineer | Fraud detection model, anomaly detection, AI pipeline |
| [![Omar Hamdy](https://img.shields.io/badge/Omar%20Hamdy-100000?style=flat&logo=github&logoColor=white)](https://github.com/omarhamdy308) | Web Developer | Admin dashboard UI and web integration | |
AI Engineer | Fraud detection model, anomaly detection, AI pipeline |
| [![Karim Elmasry](https://img.shields.io/badge/Karim%20Elmasry-100000?style=flat&logo=github&logoColor=white)](https://github.com/karimelmasry42) | Blockchain & Security | Smart contracts, blockchain integration, encryption design |

**Supervisor:** Dr. Hesham Dahshan  
*Arab Academy for Science, Technology and Maritime Transport (AASTMT)*  

---

## 🧭 Project Timeline  

### Semester 1 — Research, Design, and Planning  
- Project kickoff & scope refinement  
- Hybrid requirements and problem definition  
- Literature review and technology survey  
- System architecture and AI component design  
- Blockchain platform evaluation and cryptographic scheme design  
- UI/UX prototyping (Figma)  
- Mid-year presentation  

### Semester 2 — Implementation, Testing, and Evaluation  
- Smart contract development and deployment  
- Cryptographic and identity management modules  
- AI fraud detection component integration  
- Full system integration and testing  
- Security & performance evaluation  
- Final report and defense presentation  

---

## ⚙️ How to Run (Development Setup)
## Features

- **Voter Registration**: Secure registration process through the MACI contract, enabling eligible voting.
- **Poll Management**: Admins can easily create and manage polls, including question and options setup.
- **Secure Voting**: Leverage MACI's privacy-preserving technology to ensure votes are cast anonymously and securely.
- **Results Display**: Transparent display of poll results after the voting phase concludes.
- **Admin Dashboard**: Comprehensive admin interface for poll oversight, including current status and results analytics.

## Requirements

Ensure you have the following tools installed before you proceed:

- [Node (>= v18.17)](https://nodejs.org/en/download/)
- Yarn ([v1](https://classic.yarnpkg.com/en/docs/install/) or [v2+](https://yarnpkg.com/getting-started/install))
- [Git](https://git-scm.com/downloads)

## Quickstart

Jumpstart your development with these simple steps:

1. **Clone and Set Up the Project**

```bash
git clone https://github.com/karimelmasry42/blockvote.git
cd maci-wrapper
yarn install
```

2. **Download the zkeys for the maci circuits**

In your first terminal window, run:

```bash
yarn download-zkeys
```

3. **Update the environment variables**

Copy the env example files to env files

```bash
cp packages/hardhat/.env.example packages/hardhat/.env
cp packages/nextjs/.env.example packages/nextjs/.env.local
```

Update the values of the env variables in these new .env files

4. **Start a Local Ethereum Network**

In your first terminal window, run:

```bash
yarn chain
```

This initiates a local Ethereum network via Hardhat for development and testing purposes. Adjust the network settings in `hardhat.config.ts` as needed.

5. **Deploy Contracts**

In a second terminal, deploy your test contract with:

```bash
yarn deploy
```

Find the contract in `packages/hardhat/contracts`. This script deploys your contract to the local network, with customization available in `packages/hardhat/deploy`.

6. **Launch the NextJS Application**

In a third terminal, start the NextJS frontend:

```bash
yarn start
```

7. **Compute Results**

- Update `packages/hardhat/deploy-config.json` file, select the network, and in the `Poll` object, update `coordinatorPubkey` to the coordinator public key in the `packages/hardhat/coordinatorKeyPair.json`, and update `useQuadraticVoting` if you want to compute results for a non quadratic vote.
- Merge the poll, using `yarn hardhat merge --poll {poll id}`
- Generate proof, using `yarn hardhat prove --poll {poll id} --output-dir {proof ouput dir} --coordinator-private-key {coordinator private key} --tally-file {tally output file}`

Navigate to `http://localhost:3000` to interact with your dApp. Modify your app configuration in `packages/nextjs/scaffold.config.ts` and `packages/hardhat/constants.ts` as necessary.

The deployed contracts will be saved to the file `packages/hardhat/contractAddresses.json`, this file is compatible with maci cli.

The coordinator keys will be stored in the file `packages/hardhat/coordinatorKeyPair.json`.

## Usage

After setting up the project, you can:

- **Register**: Use the app's interface to register with the MACI contract and gain voting rights.
- **Create Polls**: As an admin, you can create polls with custom questions and options.
- **Vote**: Registered voters can participate in polls, utilizing MACI's secure voting mechanism.
- **View Results**: Access poll outcomes after the voting phase ends.
- **Admin Dashboard**: Monitor and manage ongoing polls, including viewing detailed poll status.

## Contributing

Your contributions are welcome! Feel free to report issues, submit fixes, or suggest new features to enhance the project.

## License

This project is licensed under the [MIT License](LICENSE).
>>>>>>> source/main
