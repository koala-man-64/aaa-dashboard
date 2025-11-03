# Use official Nginx image
FROM nginx:alpine

# Set the working directory
WORKDIR /usr/share/nginx/html

# Copy the React build output
COPY build /usr/share/nginx/html

# Copy SSL certificates
COPY nginx/ssl /etc/nginx/ssl

# Copy the custom Nginx configuration
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf

# Expose only HTTPS (443)
EXPOSE 443

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
