# Stage 1: Build the React application
FROM node:20-alpine AS build

# Accept build arguments for environment variables
ARG REACT_APP_SEARCH_API_URL=https://search-service-315949479081.europe-west4.run.app
ARG REACT_APP_GOOGLE_MAPS_API_KEY

# Set environment variables for the build
ENV REACT_APP_SEARCH_API_URL=${REACT_APP_SEARCH_API_URL}
ENV REACT_APP_GOOGLE_MAPS_API_KEY=${REACT_APP_GOOGLE_MAPS_API_KEY}

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json to leverage Docker cache
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application source code
COPY . .

# Generate the production build
RUN npm run build

# Stage 2: Serve the static files with a lightweight web server
FROM nginx:stable-alpine

# Copy the custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the built assets from the 'build' stage to the Nginx public directory
COPY --from=build /app/build /usr/share/nginx/html

# Expose port 80 and start Nginx
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]