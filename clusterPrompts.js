
const z = require('zod');
const { zodToJsonSchema } = require('zod-to-json-schema')
const { summariesToMarkdown } = require('./utils');



const TableRatingSchema = z.object({
    rating: z.number().describe('The rank of the cluster, from 1 to 100'),
    explaination: z.string().describe('The explaination of the rating'),
    suggestedEdits: z.string().optional().describe('The suggested edits for the cluster, if applicable'),
});
const ClusterInfoSchema = z.object({
    label: z.string().describe('The name of the cluster'),
    description: z.string().describe('The description of the cluster'),
});

const UpdatedClusterListObject = z.object({
    updatedTable: z.array(ClusterInfoSchema).describe('An array of clusters and their descriptions'),
    tableRating: TableRatingSchema.describe('The rating of the reference table and explaination'),
});

const InitialClusterListObject = z.object({
    clusters: z.array(ClusterInfoSchema).describe('An array of clusters and their descriptions for updated taxonomy'),
});

const InitialClusterListSchema = zodToJsonSchema(InitialClusterListObject);
const UpdatedClusterListSchema = zodToJsonSchema(UpdatedClusterListObject);


function generateInitialClustersPrompt(data, useCase, maxClusters,clusterNameLength, customOutputFormat){ 
    
    return  `
    # Goal: 
    Your goal is to classify the input data into meaningful categories for the given use case. 
    -**Data**: The input is a markdown table with summaries for a list of human-AI conversations, including the following fields: 
        -id: conversation identifier
        -summary: conversation summary
    -**Use case**: ${useCase} 
    # Requirements:
    -name: category name should be within ${clusterNameLength} words** It can be either a verb phrase or a noun phrase,whichever is more apropriate.
    -Total number of categories should be **no more than ${maxClusters}**.
    ## Quality
    - **No overlap or contradiction** among categories. 
    -Name is concise and clear for the category. Use only phrases that are specific to each category and avoid phrases common to all categories.
    -**Description** differentiates the category from other categories.
    -**Name** and **description** can **accurately
    ** and **consistently** classify new data points **without ambiguity**.
    -**Name** and **description** are consistant with each other. 
    -Output clusters match the data as closely as possible, without missing important categories or adding unnecessary ones
    -Output clusters should serve given use case well.
    -Output clusters should be specific and meaningful. Do not invent categories that are not in the data.
 
    
    # Data:
    ${summariesToMarkdown(data)}

    # Tips:
    -The clustertable should be a **flat list** of mutually exclusive categories. Sort them based on semantic relatedness. 
    -You can have fewer than ${maxClusters} categories in the cluster table, but **do not exceed the limit**. 
    -Be specific about each category. **Do not include vague categories** such as "General", "Miscellaneous","Other" or "Undefined" in the cluster table.
    -You can ignore low quality or ambigous data points. 

    ${customOutputFormat}
    `
}

const summarySchema = z.object({
    summary: z.string().describe('The summary of the conversation, focusing on the main topic and key points, in 50 words or less.'),
});

const summaryJsonSchema = zodToJsonSchema(summarySchema);


function generateSummarizationPrompt( data, useCase, summaryLength, customOutputFormat) {
    return `
        # GOAL:
        Summarize the input text for the given use case. 
        You input is a conversation history between a User and an AI agent.
        use case is: ${useCase}
         # Data: 
        ${data}

        # Requirements:
        -Provide a summary of input text **in ${summaryLength} words or less** that captures the use case.
        -The summary will represent the input data for clustering in the next step. 
        # Tips
        -The summary will represent the input data for clustering in the next step.
        -Be concise and clear.
        -Do not add phrases like "This is the summary of .." or "Summary:" or "Here is a summary of the conversation".
        -Within ${summaryLength} words, include the relevant infromation for the use case in the summary as possible.
        -Do not include any introductory or concluding remarks.
        -Do not include any line breaks in the summary.
        -Provide your answer in **English** only 
       
        ${customOutputFormat}
    `
}

// Update prompt
function generateClusterUpdatePrompt(clusters, data, maxClusters, useCase, suggestionLimit, customOutputFormat) {
    return `
        # Goal: 
        Your goal is to review the given reference table based on the input data for the specified use case, then update the reference table if needed.
          -You will be given a reference cluster table ,which is built on existing data. The reference table will be used to classify new data points.
          -You will compare the input data with the reference table, output a rating score of the quality of the reference table, suggest potential edits, and update the reference table if needed.
        -**Reference cluster table**: The input cluster table is a markdown table with the following fields:
            -id: category identifier
            -name: category name
            -description: category description
        -**Data**: The input data is a markdown table with summaries for a list of human-AI conversations, including the following fields:
            -id: conversation identifier
            -summary: conversation summary
        - Use case: ${useCase}

        # Requirements:

        -name: category name should be within ${clusterNameLength} words** It can be either a verb phrase or a noun phrase,whichever is more apropriate.
        -Total number of categories should be **no more than ${maxClusters}**.
        ## Quality
        - **No overlap or contradiction** among categories. 
        -Name is concise and clear for the category. Use only phrases that are specific to each category and avoid phrases common to all categories.
        -**Description** differentiates the category from other categories.
        -**Name** and **description** can **accurately
        ** and **consistently** classify new data points **without ambiguity**.
        -**Name** and **description** are consistant with each other. 
        -Output clusters match the data as closely as possible, without missing important categories or adding unnecessary ones
        -Output clusters should serve given use case well.
        -Output clusters should be specific and meaningful. Do not invent categories that are not in the data.

        # Reference cluster table:
        ${clusters}

        # Data:
        ${summariesToMarkdown(data)}
        
        ${customOutputFormat}

        # Questions:
        ## Q1: Review the given reference table and input data and provide a rating score of the reference table. The rating score should be an integer between 0 and 100, 
        higher rating score means better quality. You should consider the following factors when rating the reference table:
        -**Intrinisic quality**
          - 1.)If the cluster table meets the *Requirements* section, with clear and consistent category names and descriptions, and no overlap or contradiction among categories.
          - 2.) If the categories in the cluster table are relevant for the given use case.
          - 3.) If the cluster table includes any vague categories such as "Other", "General", "Miscellaneous", "Undefined", or "Uncategorized".
        -**Extrinsic quality**
            - 1.) If the cluster table can accurately and consistently classify the input data without ambiguity.
            - 2.) If there are missing categories in the cluster table but appear in the input data.
            - 3.) If there are unnecessary categories in the cluster table that do not appear in the input data.

        ## Q2: Based on your review, decide if you need to edit the reference table to improve its quality. If yes, suggest potential edits **within ${suggestionLimit} words**. If no, put 'N/A'. 

        Tips: 
        -You can edit the category name, description, or remove a cateogy. You can also merge or add new categories if needed. Your edits should meet the *Requirements* section.
        - The cluster table should be a **flat list** of mutually exclusive categories. Sort them based on semantic relatedness.
        -You can have fewer than ${maxClusters} categories in the cluster table, but **do not exceed the limit**. 
        -Be specific about each category. **Do not include vague categories** such as "General", "Miscellaneous","Other" or "Undefined" in the cluster table.
        -You can ignore low quality or ambigous data points.

        ## Q3: If you decide to edit the reference table, please provide your updated reference table. If you decide not to edit the reference table, please output the original reference table.

    `
}

function generateReviewPrompt(clusters, maxClusters, useCase, clusterNameLength,suggestionLimit, customOutputFormat) {
    return `
    # Goal: 
    Your goal is to review the given reference cluster table based on the requirements, and the specified use case, then update the reference table if needed.
    -You will be given a reference cluster table, which is built on existing data. The reference table will be used to classify new data points.
    -You will compare the input data with the reference table, output a rating score of the quality of the reference table, suggest potential edits, and update the reference table if needed.
    -**Reference cluster table**: The input cluster table is a markdown table with the following fields:
    -id: category identifier
    -name: category name
    -description: category description
    -**Use case**: ${useCase}

    # Requirements:
    -name: category name should be within ${clusterNameLength} words** It can be either a verb phrase or a noun phrase,whichever is more apropriate.
    -Total number of categories should be **no more than ${maxClusters}**.
    ## Quality
    - **No overlap or contradiction** among categories. 
    -Name is concise and clear for the category. Use only phrases that are specific to each category and avoid phrases common to all categories.
    -**Description** differentiates the category from other categories.
    -**Name** and **description** can **accurately
    ** and **consistently** classify new data points **without ambiguity**.
    -**Name** and **description** are consistant with each other. 
    -Output clusters match the data as closely as possible, without missing important categories or adding unnecessary ones
    -Output clusters should serve given use case well.
    -Output clusters should be specific and meaningful. Do not invent categories that are not in the data.

    
    # Reference cluster table:
    ${clusters}  
    
    # Q1: Review the given reference table and input data and provide a rating score of the reference table. The rating score should be an integer between 0 and 100, 
        higher rating score means better quality. You should consider the following factors when rating the reference table:
        -**Intrinisic quality**
          - 1.)If the cluster table meets the *Requirements* section, with clear and consistent category names and descriptions, and no overlap or contradiction among categories.
          - 2.) If the categories in the cluster table are relevant for the given use case.
          - 3.) If the cluster table includes any vague categories such as "Other", "General", "Miscellaneous", "Undefined", or "Uncategorized".
        -**Extrinsic quality**
            - 1.) If the cluster table can accurately and consistently classify the input data without ambiguity.
            - 2.) If there are missing categories in the cluster table but appear in the input data.
            - 3.) If there are unnecessary categories in the cluster table that do not appear in the input data.

    ## Q2: Based on your review, decide if you need to edit the reference table to improve its quality. If yes, suggest potential edits **within ${suggestionLimit} words**. If no, put 'N/A'. 

    Tips: 
    -You can edit the category name, description, or remove a cateogy. You can also merge or add new categories if needed. Your edits should meet the *Requirements* section.
    - The cluster table should be a **flat list** of mutually exclusive categories. Sort them based on semantic relatedness.
    -You can have fewer than ${maxClusters} categories in the cluster table, but **do not exceed the limit**. 
    -Be specific about each category. **Do not include vague categories** such as "General", "Miscellaneous","Other" or "Undefined" in the cluster table.
    -You can ignore low quality or ambigous data points.

    ## Q3: If you decide to edit the reference table, please provide your updated reference table. If you decide not to edit the reference table, please output the original reference table.


    ${customOutputFormat}
    `
}

module.exports = {
    generateInitialClustersPrompt,
    generateSummarizationPrompt,
    generateClusterUpdatePrompt,
    generateReviewPrompt,
    summaryJsonSchema,
    InitialClusterListSchema,
    UpdatedClusterListSchema,
};