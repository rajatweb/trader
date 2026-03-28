const fs = require('fs');
fetch("https://api.dhan.co/v2/optionchain", {
    method: "POST",
    headers: {
        "access-token": "eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9...", // Won't work without token, right? They proxy via /api/dhan/option-chain.
    }
})
