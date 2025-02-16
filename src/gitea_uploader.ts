#!/usr/bin/env -S deno run --allow-net --allow-read --allow-env

const config = {
    apiUrl: "https://git.ld.plazi.org/api/v1",
    owner: "plazi",
    repo: "treatments-rdf",
    token: Deno.env.get("GHTOKEN") || "", // Get token from environment variable
    releaseTag: "v1.0.0",
    releaseName: "Release v1.0.0",
    releaseBody: "Automated release upload",
  };
  
  if (!config.token) {
    console.error("Error: GHTOKEN environment variable is not set.");
    Deno.exit(1);
  }
  
  export async function uploadRelease(filePath: string) {
    if (!filePath) {
      throw new Error("File path is required.");
    }
  
    // Create release
    const releaseResponse = await fetch(`${config.apiUrl}/repos/${config.owner}/${config.repo}/releases`, {
      method: "POST",
      headers: {
        "Authorization": `token ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tag_name: config.releaseTag,
        name: config.releaseName,
        body: config.releaseBody,
      }),
    });
  
    if (!releaseResponse.ok) {
      throw new Error(`Failed to create release: ${releaseResponse.statusText}`);
    }
  
    const release = await releaseResponse.json();
    console.log(`Release created: ${release.html_url}`);
  
    // Upload file
    const file = await Deno.readFile(filePath);
    const fileName = filePath.split("/").pop() || "uploaded_file";
  
    const formData = new FormData();
    formData.append("attachment", new Blob([file]), fileName);
  
    const uploadResponse = await fetch(
      `${config.apiUrl}/repos/${config.owner}/${config.repo}/releases/${release.id}/assets`,
      {
        method: "POST",
        headers: { "Authorization": `token ${config.token}` },
        body: formData,
      }
    );
  
    if (!uploadResponse.ok) {
      throw new Error(`Failed to upload file: ${uploadResponse.statusText}`);
    }
  
    const asset = await uploadResponse.json();
    console.log(`File uploaded: ${asset.browser_download_url}`);
  }
  
  // If run as a script, process command-line arguments
  if (import.meta.main) {
    const filePath = Deno.args[0];
    if (!filePath) {
      console.error("Usage: gitea_uploader.ts <file-path>");
      Deno.exit(1);
    }
    uploadRelease(filePath).catch((error) => {
      console.error("Error:", error.message);
      Deno.exit(1);
    });
  }
  