// function previewImage(inputId, previewId) {
//     const fileInput = document.getElementById(inputId);
//     const previewImg = document.getElementById(previewId);

//     fileInput.addEventListener("change", () => {
//         const file = fileInput.files[0];
//         if (!file) return;

//         const url = URL.createObjectURL(file);
//         previewImg.src = url;
//         previewImg.style.display = "block";
//     });
// }
async function previewImage(inputId, previewId) {
    const fileInput = document.getElementById(inputId);
    const previewImg = document.getElementById(previewId);

    fileInput.addEventListener("change", async () => {
        const file = fileInput.files[0];
        if (!file) return;

        if (file.type === "image/heic" || file.name.toLowerCase().endsWith(".heic")) {
            try {
                const convertedBlob = await heic2any({
                    blob: file,
                    toType: "image/jpeg",
                });

                const url = URL.createObjectURL(convertedBlob);
                previewImg.src = url;
                previewImg.style.display = "block";
            } catch (err) {
                console.error("HEIC convert error:", err);
                previewImg.style.display = "none";
            }
            return;
        }

        const url = URL.createObjectURL(file);
        previewImg.src = url;
        previewImg.style.display = "block";
    });
}

previewImage("tv-room-file", "preview-room");
previewImage("tv-rug-file", "preview-rug");

function validateFiles(room, rug) {
    const allowed = ["image/jpeg", "image/png", "image/heic"];

    if (!allowed.includes(room.type))
        return "Ảnh phòng phải là JPG / PNG / HEIC!";
    if (!allowed.includes(rug.type))
        return "Ảnh thảm phải là JPG / PNG / HEIC!";

    if (room.size > 10 * 1024 * 1024)
        return "Ảnh phòng phải nhỏ hơn 10MB!";
    if (rug.size > 5 * 1024 * 1024)
        return "Ảnh thảm phải nhỏ hơn 5MB!";

    return null;
}

document.getElementById("tv-generate").addEventListener("click", async () => {
    const room = document.getElementById("tv-room-file").files[0];
    const rug = document.getElementById("tv-rug-file").files[0];

    if (!room || !rug) {
        alert("Vui lòng chọn đủ 2 ảnh!");
        return;
    }

    const err = validateFiles(room, rug);
    if (err) {
        document.getElementById("tv-status").innerText = "" + err;
        return;
    }

    let form = new FormData();
    form.append("room", room);
    form.append("rug", rug);

    document.getElementById("tv-status").innerText = "Đang tải lên...";
    
    let progress = 0;
    let interval = setInterval(() => {
        progress += 10;
        if (progress > 90) progress = 90;
        document.getElementById("progress").innerText = progress + "%";
    }, 200);
return;
    let resp = await fetch("upload.php", {
        method: "POST",
        body: form,
    });

    clearInterval(interval);
    document.getElementById("progress").innerText = "100%";

    let json = await resp.json();

    if (json.error) {
        document.getElementById("tv-status").innerText = " " + json.error;
        return;
    }

    let imgUrl = "data:image/jpeg;base64," + json.image;

    document.getElementById("tv-result").style.display = "block";
    document.getElementById("tv-result-img").src = imgUrl;
    document.getElementById("tv-download").href = imgUrl;

    document.getElementById("tv-status").innerText = "Hoàn tất!";
});
