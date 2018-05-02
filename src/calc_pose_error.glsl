#include <common>

// #define vertexLength 100 
uniform sampler2D vertexTexture; 
uniform int vertexTextureSize;

uniform sampler2D skinIndicesTexture;
uniform sampler2D skinWeightsTexture;

uniform int skinIndicesTextureSize; // equals to skinWeightsTextureSize

uniform sampler2D motionTexture1; 
uniform sampler2D motionTexture2;

uniform int motionTexture1Size;
uniform int motionTexture2Size;

uniform int boneSize; // ボーンの数

mat4 getMotion1Matrix(const in float i){

    float j = ( floor( gl_FragCoord.x ) * float(boneSize) + i ) * 4.0;
    float x = mod( j, float( motionTexture1Size ) );
    float y = floor( j / float( motionTexture1Size ) );

    float dx = 1.0 / float( motionTexture1Size );

    y = dx * ( y + 0.5 );

    vec4 v1 = texture2D( motionTexture1, vec2( dx * ( x + 0.5 ), y ) );
    vec4 v2 = texture2D( motionTexture1, vec2( dx * ( x + 1.5 ), y ) );
    vec4 v3 = texture2D( motionTexture1, vec2( dx * ( x + 2.5 ), y ) );
    vec4 v4 = texture2D( motionTexture1, vec2( dx * ( x + 3.5 ), y ) );

    mat4 bone = mat4( v1, v2, v3, v4 );

    return bone;

}

mat4 getMotion2Matrix(const in float i){

    float j = ( floor( gl_FragCoord.y ) * float(boneSize) + i ) * 4.0;
    float x = mod( j, float( motionTexture2Size ) );
    float y = floor( j / float( motionTexture2Size ) );

    float dx = 1.0 / float( motionTexture2Size );

    y = dx * ( y + 0.5 );

    vec4 v1 = texture2D( motionTexture2, vec2( dx * ( x + 0.5 ), y ) );
    vec4 v2 = texture2D( motionTexture2, vec2( dx * ( x + 1.5 ), y ) );
    vec4 v3 = texture2D( motionTexture2, vec2( dx * ( x + 2.5 ), y ) );
    vec4 v4 = texture2D( motionTexture2, vec2( dx * ( x + 3.5 ), y ) );

    mat4 bone = mat4( v1, v2, v3, v4 );

    return bone;

}

void main(){

    float sumX1 = 0.0;
    float sumX2 = 0.0;
    float sumZ1 = 0.0;
    float sumZ2 = 0.0;

    float dotXZ = 0.0;
    float crossXZ = 0.0;

    float poseError = 0.0;

    // Maximum array size is 512? 
    vec4 vertexPos1s[vertexLength];
    vec4 vertexPos2s[vertexLength];

    for(int i = 0; i < vertexLength; i++){

        float x = mod( float( i ), float( vertexTextureSize ) );
        float y = floor( float( i ) / float( vertexTextureSize ) );
        float dx = 1.0 / float( vertexTextureSize );

        vec4 position = texture2D( vertexTexture, vec2( dx * ( x + 0.5 ), dx * ( y + 0.5) ) );

        x = mod( float( i ), float( skinIndicesTextureSize ) );
        y = floor( float( i ) / float( skinIndicesTextureSize ) );
        dx = 1.0 / float( skinIndicesTextureSize );

        vec4 skinIndex = texture2D( skinIndicesTexture, vec2( dx * ( x + 0.5 ), dx * ( y + 0.5) ));
        vec4 skinWeight = texture2D( skinWeightsTexture, vec2( dx * ( x + 0.5 ), dx * ( y + 0.5) ));

        mat4 boneMatX = getMotion1Matrix( skinIndex.x );
        mat4 boneMatY = getMotion1Matrix( skinIndex.y );
        mat4 boneMatZ = getMotion1Matrix( skinIndex.z );
        mat4 boneMatW = getMotion1Matrix( skinIndex.w );

        mat4 skinMatrix = mat4( 0.0 );
        skinMatrix += skinWeight.x * boneMatX;
        skinMatrix += skinWeight.y * boneMatY;
        skinMatrix += skinWeight.z * boneMatZ;
        skinMatrix += skinWeight.w * boneMatW;

        vec4 vertexPos1 = skinMatrix * position;

        boneMatX = getMotion2Matrix( skinIndex.x );
        boneMatY = getMotion2Matrix( skinIndex.y );
        boneMatZ = getMotion2Matrix( skinIndex.z );
        boneMatW = getMotion2Matrix( skinIndex.w );

        skinMatrix = skinWeight.x * boneMatX;
        skinMatrix += skinWeight.y * boneMatY;
        skinMatrix += skinWeight.z * boneMatZ;
        skinMatrix += skinWeight.w * boneMatW;

        vec4 vertexPos2 = skinMatrix * position;

        sumX1 += vertexPos1.x;
        sumX2 += vertexPos2.x;
        sumZ1 += vertexPos1.z;
        sumZ2 += vertexPos2.z;
        dotXZ += vertexPos1.x * vertexPos2.x + vertexPos1.z * vertexPos2.z;
        crossXZ += vertexPos1.x * vertexPos2.z - vertexPos1.z * vertexPos2.x;

        vertexPos1s[i] = vertexPos1;
        vertexPos2s[i] = vertexPos2;

    }
    
    float weight = 1.0 / float( vertexLength );
    float theta = atan( ( crossXZ - weight * (sumX1 * sumZ2 - sumX2 * sumZ1) ) / ( dotXZ - weight *( sumX1 * sumX2 + sumZ1 * sumZ2 ) ) );
    float x0 = weight * ( sumX1 - sumX2 * cos(theta) - sumZ2 * sin(theta) );
    float z0 = weight * ( sumZ1 + sumX2 * sin(theta) - sumZ2 * cos(theta) );
    mat4 T = mat4( cos(theta),  0.0,   -sin(theta), 0.0,
                   0.0,         1.0,    0.0,        0.0,
                   sin(theta),  0.0,    cos(theta), 0.0,
                   x0,          0.0,    z0,         1.0 );

    for(int i = 0; i < vertexLength; i++){
        poseError += distance(vertexPos1s[i], T * vertexPos2s[i]);
    }

    gl_FragColor = vec4(poseError * weight);
}