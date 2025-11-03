import React, { useEffect, useState } from "react";
import Papa from "papaparse";
import { BlobServiceClient } from "@azure/storage-blob";

function Data() {
  // Page-level configuration variables
  const storageAccountName = "nwmiwsstorageaccount";
  const sasToken = "sv=2024-11-04&ss=bfqt&srt=sco&sp=rwdlacupiytfx&se=2055-03-28T11:52:57Z&st=2025-03-28T03:52:57Z&spr=https&sig=3%2Fe9jY4M%2F0yFHftpJmTsuVvlPwpn7B4zQ9ey0bwnQ2w%3D";
  const containerName = "nwmiws";
  
  // List of available CSV files in the Azure Blob container.
  const csvFiles = ["locations.csv", "water_quality_data.csv"];
  const [selectedFile, setSelectedFile] = useState(csvFiles[0]);
  const [csvData, setCsvData] = useState([]);
  const [initialCsvData, setInitialCsvData] = useState([]);
  const [loading, setLoading] = useState(true);

  // Function to load CSV file from the Azure Blob container.
  const loadCSV = (fileName) => {
    setLoading(true);
    const fileUrl = `https://${storageAccountName}.blob.core.windows.net/${containerName}/${fileName}?${sasToken}`;
    
    fetch(fileUrl)
      .then((response) => response.text())
      .then((csvText) => {
        Papa.parse(csvText, {
          header: true,
          complete: (result) => {
            // Remove rows that are completely empty.
            const filteredData = result.data.filter(row =>
              Object.values(row).some(
                (val) => val && val.toString().trim() !== ""
              )
            );
            setCsvData(filteredData);
            setInitialCsvData(filteredData); // Store original data for cancel/undo
            setLoading(false);
          },
        });
      })
      .catch((error) => {
        console.error("Error loading CSV:", error);
        setLoading(false);
      });
  };

  // Load CSV whenever the selected file changes.
  useEffect(() => {
    loadCSV(selectedFile);
  }, [selectedFile]);

  // Handle changes in CSV data cells.
  const handleChange = (rowIndex, field, newValue) => {
    const updatedData = [...csvData];
    updatedData[rowIndex][field] = newValue;
    setCsvData(updatedData);
  };

  // Add new row: use headers from the first row if available.
  const addNewRow = () => {
    let newRow = {};
    if (csvData.length > 0) {
      const headers = Object.keys(csvData[0]);
      headers.forEach((header) => {
        newRow[header] = "";
      });
    }
    setCsvData([...csvData, newRow]);
  };

  // Delete row: remove a row from csvData by index.
  const deleteRow = (rowIndex) => {
    const updatedData = csvData.filter((_, index) => index !== rowIndex);
    setCsvData(updatedData);
  };

  // Cancel changes: reset csvData to the initially loaded data.
  const cancelChanges = () => {
    setCsvData(initialCsvData);
  };

  // Function to update or create a CSV file in the Azure Blob container.
  const commitSave = async () => {
    const csv = Papa.unparse(csvData);
    const blobData = new Blob([csv], { type: "text/csv;charset=utf-8;" });

    const blobServiceClient = new BlobServiceClient(
      `https://${storageAccountName}.blob.core.windows.net/?${sasToken}`
    );
    const containerClient = blobServiceClient.getContainerClient(containerName);

    const blobName = String(selectedFile);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    try {
      await blockBlobClient.uploadData(blobData, {
        blobHTTPHeaders: { blobContentType: "text/csv" },
      });
      alert("CSV file uploaded successfully!");
    } catch (error) {
      console.error("Error uploading CSV:", error);
      alert("Error uploading CSV file.");
    }
  };

  if (loading) return <div>Loading CSV data...</div>;

  return (
    <div style={{ padding: "20px" }}>
      <h2>Data Editor</h2>
      {/* CSV File Selection */}
      <div style={{ marginBottom: "15px" }}>
        <label htmlFor="csv-select">Select CSV File: </label>
        <select
          id="csv-select"
          value={selectedFile}
          onChange={(e) => setSelectedFile(e.target.value)}
        >
          {csvFiles.map((file, idx) => (
            <option key={idx} value={file}>
              {file}
            </option>
          ))}
        </select>
      </div>
      {/* Add New Row Button */}
      <div style={{ marginBottom: "15px" }}>
        <button onClick={addNewRow}>Add New Row</button>
      </div>
      {/* Editable CSV Data Table */}
      <table border="1" cellPadding="5" cellSpacing="0">
        <thead>
          <tr>
            {csvData.length > 0 &&
              Object.keys(csvData[0]).map((header, index) => (
                <th key={index}>{header}</th>
              ))}
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {csvData.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {Object.entries(row).map(([field, value], colIndex) => (
                <td key={colIndex}>
                  <input
                    type="text"
                    value={value}
                    onChange={(e) =>
                      handleChange(rowIndex, field, e.target.value)
                    }
                  />
                </td>
              ))}
              <td>
                <button onClick={() => deleteRow(rowIndex)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <br />
      {/* Commit and Cancel Buttons */}
      <button onClick={commitSave}>Commit Save</button>
      <button onClick={cancelChanges} style={{ marginLeft: "10px" }}>Cancel Changes</button>
    </div>
  );
}

export default Data;
