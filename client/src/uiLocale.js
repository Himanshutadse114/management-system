/*
 * App-wide interface localisation.
 *
 * Some workspaces are loaded only after a role is resolved and many server
 * messages arrive after the first React render.  This layer localises those
 * late nodes too, while preserving input values, e-mail addresses and URLs.
 * Exact operational phrases use reviewed translations; the word catalogue
 * and Devanagari transliterator keep uncommon server/status copy from falling
 * back to an English-only interface.
 */

const exact = {
  hi: {
    English: "अंग्रेज़ी",
    Language: "भाषा",
    Menu: "मेनू",
    Home: "होम",
    Stock: "स्टॉक",
    Sales: "बिक्री",
    Restaurant: "रेस्टोरेंट",
    Growth: "विकास",
    "Owner Control": "मालिक नियंत्रण",
    Ecosystem: "इकोसिस्टम",
    "Sales & Profit": "बिक्री और लाभ",
    Reports: "रिपोर्ट",
    Settings: "सेटिंग्स",
    Billing: "बिलिंग",
    "Take Orders": "ऑर्डर लें",
    "Branch Manager": "शाखा प्रबंधक",
    "Stock Manager": "स्टॉक प्रबंधक",
    Cashier: "कैशियर",
    Waiter: "वेटर",
    Auditor: "ऑडिटर",
    "Branch Staff": "शाखा स्टाफ",
    "Super Admin": "सुपर एडमिन",
    "Business Admin": "व्यवसाय एडमिन",
    "Signed-in user": "साइन-इन उपयोगकर्ता",
    "Close menu": "मेनू बंद करें",
    "Sign out": "साइन आउट",
    Refresh: "रीफ्रेश",
    Search: "खोजें",
    Save: "सेव करें",
    Cancel: "रद्द करें",
    Close: "बंद करें",
    Create: "बनाएँ",
    Add: "जोड़ें",
    Edit: "संपादित करें",
    Delete: "हटाएँ",
    Download: "डाउनलोड",
    Continue: "आगे बढ़ें",
    Back: "वापस",
    Next: "अगला",
    Done: "पूर्ण",
    Active: "सक्रिय",
    Inactive: "निष्क्रिय",
    Pending: "लंबित",
    Ready: "तैयार",
    Open: "खुला",
    Closed: "बंद",
    Paid: "भुगतान हुआ",
    Unpaid: "भुगतान बाकी",
    All: "सभी",
    Today: "आज",
    Yesterday: "कल",
    Name: "नाम",
    Email: "ईमेल",
    Phone: "फ़ोन",
    Password: "पासवर्ड",
    Username: "यूज़रनेम",
    Role: "भूमिका",
    Status: "स्थिति",
    Amount: "राशि",
    Quantity: "मात्रा",
    Price: "कीमत",
    Total: "कुल",
    Date: "तारीख",
    From: "से",
    To: "तक",
    Business: "व्यवसाय",
    Branch: "शाखा",
    "All branches": "सभी शाखाएँ",
    "Assigned business": "असाइन व्यवसाय",
    "No data available": "डेटा उपलब्ध नहीं",
    "Loading…": "लोड हो रहा है…",
    "Loading...": "लोड हो रहा है...",
    "Creating table...": "टेबल बनाया जा रहा है...",
    "Add table & QR": "टेबल और QR जोड़ें",
    "Create table QR": "टेबल QR बनाएँ",
    "Table menu QR": "टेबल मेनू QR",
    "QR codes": "QR कोड",
    "Customer menu preview": "ग्राहक मेनू पूर्वावलोकन",
    "Open customer menu": "ग्राहक मेनू खोलें",
    "Current menu": "वर्तमान मेनू",
    "Menu items": "मेनू आइटम",
    "Add to menu": "मेनू में जोड़ें",
    "New table": "नई टेबल",
    "Table name": "टेबल का नाम",
    "Short code": "छोटा कोड",
    Seats: "सीटें",
    Orders: "ऑर्डर",
    Kitchen: "रसोई",
    "Guest Orders": "अतिथि ऑर्डर",
    Reservations: "आरक्षण",
    Tables: "टेबल",
    "Orders & bills": "ऑर्डर और बिल",
    "Open orders": "खुले ऑर्डर",
    "Payment method": "भुगतान माध्यम",
    "Split payment": "विभाजित भुगतान",
    "No open orders": "कोई खुला ऑर्डर नहीं",
    "Food & Drinks": "खाना और पेय",
    Description: "विवरण",
    "Modifier groups": "विकल्प समूह",
    "Combo contents (one per line)": "कॉम्बो सामग्री (हर पंक्ति में एक)",
    "Show as featured": "विशेष रूप से दिखाएँ",
    "Create offer": "ऑफ़र बनाएँ",
    "Offer name": "ऑफ़र का नाम",
    Type: "प्रकार",
    Value: "मान",
    "Accept direct orders": "सीधे ऑर्डर स्वीकार करें",
    "Save store": "स्टोर सेव करें",
    "Current platform coverage": "वर्तमान प्लेटफ़ॉर्म सुविधाएँ",
    "Assign a branch to view live data.": "लाइव डेटा देखने के लिए शाखा असाइन करें।",
    "Keep business": "व्यवसाय रखें",
    "Delete business": "व्यवसाय हटाएँ",
    "Delete business?": "व्यवसाय हटाएँ?",
    "Create branch": "शाखा बनाएँ",
    "Branch name": "शाखा का नाम",
    "Business name": "व्यवसाय का नाम",
    "Reset password": "पासवर्ड रीसेट करें",
    "Generate password": "पासवर्ड बनाएँ",
    "Copy password": "पासवर्ड कॉपी करें",
    "Staff & access": "स्टाफ और एक्सेस",
    "Create staff": "स्टाफ बनाएँ",
    "Assigned staff": "असाइन स्टाफ",
    "Select branch": "शाखा चुनें",
    "Select role": "भूमिका चुनें",
    "Sales & Orders": "बिक्री और ऑर्डर",
    Inventory: "इन्वेंटरी",
    Analytics: "विश्लेषण",
    "Restaurant Operations": "रेस्टोरेंट संचालन",
    "Direct store": "सीधा स्टोर",
    Customers: "ग्राहक",
    Offers: "ऑफ़र",
    Channels: "चैनल",
    Settlements: "निपटान",
    Feedback: "प्रतिक्रिया",
    "Customers & loyalty": "ग्राहक और लॉयल्टी",
    "Customers & Loyalty": "ग्राहक और लॉयल्टी",
    "Low stock": "कम स्टॉक",
    Purchases: "खरीद",
    Suppliers: "आपूर्तिकर्ता",
    Wastage: "बर्बादी",
    Adjustments: "समायोजन",
    Products: "उत्पाद",
    "Recent sales": "हाल की बिक्री",
    Checkout: "चेकआउट",
    Cash: "नकद",
    Card: "कार्ड",
    Other: "अन्य",
    "Start shift": "शिफ्ट शुरू करें",
    "Close shift": "शिफ्ट बंद करें",
    "End shift": "शिफ्ट समाप्त करें",
    "Submit for approval": "अनुमोदन के लिए भेजें",
    Approve: "अनुमोदित करें",
    Reject: "अस्वीकार करें",
    "Daily closing": "दैनिक समापन",
    "View report": "रिपोर्ट देखें",
    "Generate report": "रिपोर्ट बनाएँ",
    "Previous reports": "पिछली रिपोर्ट",
    "No reports yet": "अभी कोई रिपोर्ट नहीं",
    "File type": "फ़ाइल प्रकार",
    "Operating hours": "संचालन समय",
    "Tax settings": "कर सेटिंग्स",
    "Receipt settings": "रसीद सेटिंग्स",
    "Payment settings": "भुगतान सेटिंग्स",
    "Save settings": "सेटिंग्स सेव करें",
  },
  mr: {
    English: "इंग्रजी",
    Language: "भाषा",
    Menu: "मेनू",
    Home: "मुख्यपृष्ठ",
    Stock: "साठा",
    Sales: "विक्री",
    Restaurant: "रेस्टॉरंट",
    Growth: "वाढ",
    "Owner Control": "मालक नियंत्रण",
    Ecosystem: "इकोसिस्टम",
    "Sales & Profit": "विक्री आणि नफा",
    Reports: "अहवाल",
    Settings: "सेटिंग्ज",
    Billing: "बिलिंग",
    "Take Orders": "ऑर्डर घ्या",
    "Branch Manager": "शाखा व्यवस्थापक",
    "Stock Manager": "साठा व्यवस्थापक",
    Cashier: "कॅशियर",
    Waiter: "वेटर",
    Auditor: "लेखापरीक्षक",
    "Branch Staff": "शाखा कर्मचारी",
    "Super Admin": "सुपर अॅडमिन",
    "Business Admin": "व्यवसाय अॅडमिन",
    "Signed-in user": "साइन-इन वापरकर्ता",
    "Close menu": "मेनू बंद करा",
    "Sign out": "साइन आउट",
    Refresh: "रिफ्रेश",
    Search: "शोधा",
    Save: "सेव्ह करा",
    Cancel: "रद्द करा",
    Close: "बंद करा",
    Create: "तयार करा",
    Add: "जोडा",
    Edit: "संपादित करा",
    Delete: "हटवा",
    Download: "डाउनलोड",
    Continue: "पुढे जा",
    Back: "मागे",
    Next: "पुढील",
    Done: "पूर्ण",
    Active: "सक्रिय",
    Inactive: "निष्क्रिय",
    Pending: "प्रलंबित",
    Ready: "तयार",
    Open: "उघडे",
    Closed: "बंद",
    Paid: "भरणा झाला",
    Unpaid: "भरणा बाकी",
    All: "सर्व",
    Today: "आज",
    Yesterday: "काल",
    Name: "नाव",
    Email: "ईमेल",
    Phone: "फोन",
    Password: "पासवर्ड",
    Username: "वापरकर्तानाव",
    Role: "भूमिका",
    Status: "स्थिती",
    Amount: "रक्कम",
    Quantity: "प्रमाण",
    Price: "किंमत",
    Total: "एकूण",
    Date: "तारीख",
    From: "पासून",
    To: "पर्यंत",
    Business: "व्यवसाय",
    Branch: "शाखा",
    "All branches": "सर्व शाखा",
    "Assigned business": "नियुक्त व्यवसाय",
    "No data available": "डेटा उपलब्ध नाही",
    "Loading…": "लोड होत आहे…",
    "Loading...": "लोड होत आहे...",
    "Creating table...": "टेबल तयार होत आहे...",
    "Add table & QR": "टेबल आणि QR जोडा",
    "Create table QR": "टेबल QR तयार करा",
    "Table menu QR": "टेबल मेनू QR",
    "QR codes": "QR कोड",
    "Customer menu preview": "ग्राहक मेनू पूर्वावलोकन",
    "Open customer menu": "ग्राहक मेनू उघडा",
    "Current menu": "सध्याचा मेनू",
    "Menu items": "मेनू पदार्थ",
    "Add to menu": "मेनूमध्ये जोडा",
    "New table": "नवीन टेबल",
    "Table name": "टेबलचे नाव",
    "Short code": "लघु कोड",
    Seats: "जागा",
    Orders: "ऑर्डर",
    Kitchen: "स्वयंपाकघर",
    "Guest Orders": "पाहुण्यांच्या ऑर्डर",
    Reservations: "आरक्षण",
    Tables: "टेबल",
    "Orders & bills": "ऑर्डर आणि बिले",
    "Open orders": "खुल्या ऑर्डर",
    "Payment method": "पेमेंट पद्धत",
    "Split payment": "विभाजित पेमेंट",
    "No open orders": "खुल्या ऑर्डर नाहीत",
    "Food & Drinks": "खाद्य आणि पेये",
    Description: "वर्णन",
    "Modifier groups": "पर्याय गट",
    "Combo contents (one per line)": "कॉम्बो सामग्री (प्रत्येक ओळीत एक)",
    "Show as featured": "विशेष म्हणून दाखवा",
    "Create offer": "ऑफर तयार करा",
    "Offer name": "ऑफरचे नाव",
    Type: "प्रकार",
    Value: "मूल्य",
    "Accept direct orders": "थेट ऑर्डर स्वीकारा",
    "Save store": "स्टोअर सेव्ह करा",
    "Current platform coverage": "सध्याच्या प्लॅटफॉर्म सुविधा",
    "Assign a branch to view live data.": "थेट डेटा पाहण्यासाठी शाखा नियुक्त करा.",
    "Keep business": "व्यवसाय ठेवा",
    "Delete business": "व्यवसाय हटवा",
    "Delete business?": "व्यवसाय हटवायचा?",
    "Create branch": "शाखा तयार करा",
    "Branch name": "शाखेचे नाव",
    "Business name": "व्यवसायाचे नाव",
    "Reset password": "पासवर्ड रीसेट करा",
    "Generate password": "पासवर्ड तयार करा",
    "Copy password": "पासवर्ड कॉपी करा",
    "Staff & access": "कर्मचारी आणि प्रवेश",
    "Create staff": "कर्मचारी तयार करा",
    "Assigned staff": "नियुक्त कर्मचारी",
    "Select branch": "शाखा निवडा",
    "Select role": "भूमिका निवडा",
    "Sales & Orders": "विक्री आणि ऑर्डर",
    Inventory: "इन्व्हेंटरी",
    Analytics: "विश्लेषण",
    "Restaurant Operations": "रेस्टॉरंट संचालन",
    "Direct store": "थेट स्टोअर",
    Customers: "ग्राहक",
    Offers: "ऑफर",
    Channels: "चॅनेल",
    Settlements: "ताळमेळ",
    Feedback: "अभिप्राय",
    "Customers & loyalty": "ग्राहक आणि निष्ठा",
    "Customers & Loyalty": "ग्राहक आणि निष्ठा",
    "Low stock": "कमी साठा",
    Purchases: "खरेदी",
    Suppliers: "पुरवठादार",
    Wastage: "नासाडी",
    Adjustments: "समायोजन",
    Products: "उत्पादने",
    "Recent sales": "अलीकडील विक्री",
    Checkout: "चेकआउट",
    Cash: "रोख",
    Card: "कार्ड",
    Other: "इतर",
    "Start shift": "शिफ्ट सुरू करा",
    "Close shift": "शिफ्ट बंद करा",
    "End shift": "शिफ्ट समाप्त करा",
    "Submit for approval": "मंजुरीसाठी पाठवा",
    Approve: "मंजूर करा",
    Reject: "नाकारा",
    "Daily closing": "दैनिक बंद",
    "View report": "अहवाल पहा",
    "Generate report": "अहवाल तयार करा",
    "Previous reports": "मागील अहवाल",
    "No reports yet": "अजून अहवाल नाहीत",
    "File type": "फाइल प्रकार",
    "Operating hours": "कामकाजाची वेळ",
    "Tax settings": "कर सेटिंग्ज",
    "Receipt settings": "पावती सेटिंग्ज",
    "Payment settings": "पेमेंट सेटिंग्ज",
    "Save settings": "सेटिंग्ज सेव्ह करा",
  },
};

const words = {
  hi: {
    account: "खाता", action: "कार्य", add: "जोड़ें", admin: "एडमिन", all: "सभी", amount: "राशि", analytics: "विश्लेषण", approval: "अनुमोदन", approve: "अनुमोदित करें", assign: "असाइन", assigned: "असाइन", available: "उपलब्ध", balance: "शेष", bill: "बिल", bills: "बिल", branch: "शाखा", branches: "शाखाएँ", business: "व्यवसाय", cashier: "कैशियर", category: "श्रेणी", channel: "चैनल", channels: "चैनल", close: "बंद", code: "कोड", customer: "ग्राहक", customers: "ग्राहक", dashboard: "डैशबोर्ड", date: "तारीख", delete: "हटाएँ", details: "विवरण", device: "डिवाइस", direct: "सीधा", discount: "छूट", download: "डाउनलोड", edit: "संपादित", employee: "कर्मचारी", expense: "खर्च", expenses: "खर्च", feedback: "प्रतिक्रिया", generate: "बनाएँ", group: "समूह", guest: "अतिथि", history: "इतिहास", inventory: "इन्वेंटरी", item: "आइटम", items: "आइटम", kitchen: "रसोई", loading: "लोड हो रहा", login: "लॉगिन", logout: "लॉगआउट", loyalty: "लॉयल्टी", manager: "प्रबंधक", menu: "मेनू", method: "माध्यम", name: "नाम", new: "नया", no: "कोई नहीं", offer: "ऑफ़र", offers: "ऑफ़र", open: "खोलें", order: "ऑर्डर", orders: "ऑर्डर", owner: "मालिक", password: "पासवर्ड", payment: "भुगतान", pending: "लंबित", price: "कीमत", product: "उत्पाद", products: "उत्पाद", profit: "लाभ", purchase: "खरीद", purchases: "खरीद", quantity: "मात्रा", ready: "तैयार", receipt: "रसीद", reconciliation: "मिलान", refund: "रिफंड", report: "रिपोर्ट", reports: "रिपोर्ट", reservation: "आरक्षण", reservations: "आरक्षण", restaurant: "रेस्टोरेंट", role: "भूमिका", sale: "बिक्री", sales: "बिक्री", save: "सेव", search: "खोजें", select: "चुनें", service: "सेवा", settings: "सेटिंग्स", shift: "शिफ्ट", staff: "स्टाफ", status: "स्थिति", stock: "स्टॉक", store: "स्टोर", submit: "भेजें", supplier: "आपूर्तिकर्ता", suppliers: "आपूर्तिकर्ता", table: "टेबल", tables: "टेबल", tax: "कर", total: "कुल", type: "प्रकार", user: "उपयोगकर्ता", username: "यूज़रनेम", value: "मान", vendor: "विक्रेता", waiter: "वेटर", wastage: "बर्बादी", with: "के साथ", without: "बिना", and: "और", or: "या", for: "के लिए", from: "से", to: "तक", of: "का", in: "में", is: "है", are: "हैं", your: "आपका", this: "यह", current: "वर्तमान", create: "बनाएँ", update: "अपडेट", view: "देखें", manage: "प्रबंधित करें", management: "प्रबंधन", operations: "संचालन", access: "एक्सेस", control: "नियंत्रण", overview: "सारांश", workspace: "कार्यस्थल", active: "सक्रिय", inactive: "निष्क्रिय", previous: "पिछला", next: "अगला", phone: "फ़ोन", email: "ईमेल", address: "पता", notes: "नोट", description: "विवरण", reason: "कारण", paid: "भुगतान हुआ", unpaid: "भुगतान बाकी", start: "शुरू", end: "समाप्त", time: "समय", hours: "घंटे", day: "दिन", daily: "दैनिक", monthly: "मासिक", summary: "सारांश", performance: "प्रदर्शन", low: "कम", out: "समाप्त", online: "ऑनलाइन", offline: "ऑफ़लाइन", successful: "सफल", failed: "विफल", error: "त्रुटि", retry: "फिर प्रयास", confirm: "पुष्टि", cancel: "रद्द", yes: "हाँ", done: "पूर्ण"
  },
  mr: {
    account: "खाते", action: "कृती", add: "जोडा", admin: "अॅडमिन", all: "सर्व", amount: "रक्कम", analytics: "विश्लेषण", approval: "मंजुरी", approve: "मंजूर करा", assign: "नियुक्त करा", assigned: "नियुक्त", available: "उपलब्ध", balance: "शिल्लक", bill: "बिल", bills: "बिले", branch: "शाखा", branches: "शाखा", business: "व्यवसाय", cashier: "कॅशियर", category: "श्रेणी", channel: "चॅनेल", channels: "चॅनेल", close: "बंद", code: "कोड", customer: "ग्राहक", customers: "ग्राहक", dashboard: "डॅशबोर्ड", date: "तारीख", delete: "हटवा", details: "तपशील", device: "उपकरण", direct: "थेट", discount: "सवलत", download: "डाउनलोड", edit: "संपादित", employee: "कर्मचारी", expense: "खर्च", expenses: "खर्च", feedback: "अभिप्राय", generate: "तयार करा", group: "गट", guest: "पाहुणा", history: "इतिहास", inventory: "इन्व्हेंटरी", item: "आयटम", items: "आयटम", kitchen: "स्वयंपाकघर", loading: "लोड होत आहे", login: "लॉगिन", logout: "लॉगआउट", loyalty: "निष्ठा", manager: "व्यवस्थापक", menu: "मेनू", method: "पद्धत", name: "नाव", new: "नवीन", no: "नाही", offer: "ऑफर", offers: "ऑफर", open: "उघडा", order: "ऑर्डर", orders: "ऑर्डर", owner: "मालक", password: "पासवर्ड", payment: "पेमेंट", pending: "प्रलंबित", price: "किंमत", product: "उत्पादन", products: "उत्पादने", profit: "नफा", purchase: "खरेदी", purchases: "खरेदी", quantity: "प्रमाण", ready: "तयार", receipt: "पावती", reconciliation: "ताळमेळ", refund: "परतावा", report: "अहवाल", reports: "अहवाल", reservation: "आरक्षण", reservations: "आरक्षण", restaurant: "रेस्टॉरंट", role: "भूमिका", sale: "विक्री", sales: "विक्री", save: "सेव्ह", search: "शोधा", select: "निवडा", service: "सेवा", settings: "सेटिंग्ज", shift: "शिफ्ट", staff: "कर्मचारी", status: "स्थिती", stock: "साठा", store: "स्टोअर", submit: "पाठवा", supplier: "पुरवठादार", suppliers: "पुरवठादार", table: "टेबल", tables: "टेबल", tax: "कर", total: "एकूण", type: "प्रकार", user: "वापरकर्ता", username: "वापरकर्तानाव", value: "मूल्य", vendor: "विक्रेता", waiter: "वेटर", wastage: "नासाडी", with: "सह", without: "शिवाय", and: "आणि", or: "किंवा", for: "साठी", from: "पासून", to: "पर्यंत", of: "चा", in: "मध्ये", is: "आहे", are: "आहेत", your: "तुमचे", this: "हे", current: "सध्याचे", create: "तयार करा", update: "अपडेट", view: "पहा", manage: "व्यवस्थापित करा", management: "व्यवस्थापन", operations: "संचालन", access: "प्रवेश", control: "नियंत्रण", overview: "आढावा", workspace: "कार्यस्थळ", active: "सक्रिय", inactive: "निष्क्रिय", previous: "मागील", next: "पुढील", phone: "फोन", email: "ईमेल", address: "पत्ता", notes: "नोंदी", description: "वर्णन", reason: "कारण", paid: "भरणा झाला", unpaid: "भरणा बाकी", start: "सुरू", end: "समाप्त", time: "वेळ", hours: "तास", day: "दिवस", daily: "दैनिक", monthly: "मासिक", summary: "सारांश", performance: "कामगिरी", low: "कमी", out: "संपले", online: "ऑनलाइन", offline: "ऑफलाइन", successful: "यशस्वी", failed: "अयशस्वी", error: "त्रुटी", retry: "पुन्हा प्रयत्न", confirm: "पुष्टी", cancel: "रद्द", yes: "होय", done: "पूर्ण"
  },
};

const transliterationPairs = [
  ["tion", "शन"], ["sion", "झन"], ["ture", "चर"], ["ough", "ओ"],
  ["sh", "श"], ["ch", "च"], ["th", "थ"], ["ph", "फ"], ["kh", "ख"],
  ["gh", "घ"], ["bh", "भ"], ["dh", "ध"], ["wh", "व"], ["ck", "क"],
  ["oo", "ू"], ["ee", "ी"], ["ai", "े"], ["ay", "े"], ["au", "ौ"],
  ["ou", "ाउ"], ["ow", "ाउ"], ["ea", "ी"], ["er", "र"], ["or", "ॉर"],
  ["ar", "ार"], ["qu", "क्व"],
];

const latinMap = {
  a: "अ", b: "ब", c: "क", d: "ड", e: "े", f: "फ", g: "ग", h: "ह",
  i: "ि", j: "ज", k: "क", l: "ल", m: "म", n: "न", o: "ो", p: "प",
  q: "क", r: "र", s: "स", t: "ट", u: "ु", v: "व", w: "व", x: "क्स",
  y: "य", z: "ज़",
};

function transliterateWord(word) {
  if (!/[A-Za-z]/.test(word)) return word;
  if (/^(?:QR|UPI|POS|GST|SKU|ID|PDF|XLSX|ML|P&L)$/i.test(word)) return word.toUpperCase();
  let source = word.toLowerCase();
  let result = "";
  while (source) {
    const pair = transliterationPairs.find(([latin]) => source.startsWith(latin));
    if (pair) {
      result += pair[1];
      source = source.slice(pair[0].length);
    } else {
      const char = source[0];
      result += latinMap[char] || char;
      source = source.slice(1);
    }
  }
  return result;
}

function preserveToken(token) {
  return /^https?:\/\//i.test(token)
    || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(token)
    || /^₹?[\d.,%:+/-]+$/.test(token)
    || /^(?:QR|UPI|POS|GST|SKU|ID|PDF|XLSX|ML|P&L)$/i.test(token);
}

export function translateInterfaceText(locale, input) {
  if (locale === "en" || input == null) return String(input ?? "");
  const source = String(input);
  const trimmed = source.trim();
  if (!trimmed || !/[A-Za-z]/.test(trimmed)) return source;
  if (/^(?:https?:\/\/|mailto:|tel:)/i.test(trimmed) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return source;

  const dictionary = exact[locale] || exact.hi;
  const direct = dictionary[trimmed];
  let translated;
  if (direct) {
    translated = direct;
  } else {
    const wordDictionary = words[locale] || words.hi;
    translated = trimmed.replace(/[A-Za-z][A-Za-z'&-]*/g, (token) => {
      if (preserveToken(token)) return token;
      return wordDictionary[token.toLowerCase()] || transliterateWord(token);
    });
  }
  return source.replace(trimmed, translated);
}

const originalText = new WeakMap();
const lastText = new WeakMap();
const originalAttributes = new WeakMap();

function localiseTextNode(node, locale) {
  const current = node.nodeValue || "";
  const previousLocalised = lastText.get(node);
  if (!originalText.has(node) || (previousLocalised != null && current !== previousLocalised)) {
    originalText.set(node, current);
  }
  const next = translateInterfaceText(locale, originalText.get(node));
  lastText.set(node, next);
  if (current !== next) node.nodeValue = next;
}

function localiseAttributes(element, locale) {
  const names = ["placeholder", "title", "aria-label"];
  let originals = originalAttributes.get(element);
  if (!originals) {
    originals = {};
    originalAttributes.set(element, originals);
  }
  for (const name of names) {
    if (!element.hasAttribute(name)) continue;
    const current = element.getAttribute(name) || "";
    const lastKey = `last:${name}`;
    if (!(name in originals) || (originals[lastKey] != null && current !== originals[lastKey])) {
      originals[name] = current;
    }
    const next = translateInterfaceText(locale, originals[name]);
    originals[lastKey] = next;
    if (current !== next) element.setAttribute(name, next);
  }
}

function localiseTree(root, locale) {
  if (!root) return;
  if (root.nodeType === Node.TEXT_NODE) {
    localiseTextNode(root, locale);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const element = root;
  if (element.matches("script, style, code, pre, [data-i18n-skip]")) return;
  localiseAttributes(element, locale);
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const parent = node.parentElement;
    if (!parent?.closest("script, style, code, pre, [data-i18n-skip]")) localiseTextNode(node, locale);
    node = walker.nextNode();
  }
  for (const child of element.querySelectorAll("[placeholder], [title], [aria-label]")) {
    if (!child.closest("[data-i18n-skip]")) localiseAttributes(child, locale);
  }
}

export function installInterfaceLocaliser(locale) {
  if (typeof document === "undefined" || typeof MutationObserver === "undefined") return () => {};
  const root = document.getElementById("root");
  if (!root) return () => {};
  localiseTree(root, locale);
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "characterData") localiseTextNode(mutation.target, locale);
      if (mutation.type === "attributes") localiseAttributes(mutation.target, locale);
      for (const node of mutation.addedNodes || []) localiseTree(node, locale);
    }
  });
  observer.observe(root, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["placeholder", "title", "aria-label"],
  });
  return () => observer.disconnect();
}

export const reviewedInterfaceTranslations = exact;
