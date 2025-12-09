<?php

class Visualizer
{
    private string $tempDir;

    public function __construct()
    {
        $this->tempDir = __DIR__ . '/../storage/temp';
        if (!file_exists($this->tempDir)) {
            mkdir($this->tempDir, 0777, true);
        }
    }

    public function generate(string $roomTmp, string $rugTmp, string $roomName, string $rugName)
    {
        $roomPath = $this->tempDir . '/room_' . time() . '_' . basename($roomName);
        $rugPath  = $this->tempDir . '/rug_' . time() . '_' . basename($rugName);

        move_uploaded_file($roomTmp, $roomPath);
        move_uploaded_file($rugTmp, $rugPath);

        try {
            $imgBase64 = $this->callApi($roomPath, $rugPath);
        } catch (Exception $e) {
            return ['error' => $e->getMessage()];
        }

        // Xóa file tạm
        @unlink($roomPath);
        @unlink($rugPath);

        return ['image' => $imgBase64];
    }

    private function callApi($roomFile, $rugFile)
    {
        $api_url = "https://n8n-ec2.cahy.io.vn/webhook/bananaproGen";

        $cfileRoom = new CURLFile($roomFile, mime_content_type($roomFile), basename($roomFile));
        $cfileRug  = new CURLFile($rugFile, mime_content_type($rugFile), basename($rugFile));

        $payload = [
            "prompt" => "Insert the attached carpet map as the exact texture of a large area rug (preserve colors, patterns, and fabric details).
Place this rug into an interior space that MATCHES and COMPLEMENTS the style, color palette, and aesthetic of the rug’s design.
Generate a realistic interior scene (living room or bedroom) that harmonizes with the rug’s style — including furniture, lighting, and materials that fit naturally with the rug.
High-resolution interior design photography, soft natural light, clean composition, realistic shadows, and detailed textures.",
            "room_file" => $cfileRoom,
            "rug_file"  => $cfileRug,
        ];

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $api_url);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 600);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);

        $resp = curl_exec($ch);

        if (curl_errno($ch)) {
            throw new Exception("Curl error: " . curl_error($ch));
        }

        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($code !== 200) {
            throw new Exception("API trả mã $code — Response: $resp");
        }

        $json = json_decode($resp, true);
        if (!$json || empty($json["image_base64"])) {
            throw new Exception("API không trả image hợp lệ: " . $resp);
        }

        return $json["image_base64"];
    }
}
